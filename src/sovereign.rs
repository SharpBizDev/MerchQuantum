use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
use crate::models::{QuantumError, SystemError};
use crate::mutex_manager::with_v_drive_write_lock;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::neural::janitor;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ui::surface_projection::dispatch_surface_packet;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::thread;
use std::time::{Duration, Instant};
#[cfg(target_os = "windows")]
use windows::core::{BSTR, PCWSTR, VARIANT};
#[cfg(target_os = "windows")]
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoInitializeSecurity, CoSetProxyBlanket, CoUninitialize,
    CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
    RPC_C_AUTHN_LEVEL_DEFAULT, RPC_C_IMP_LEVEL_IMPERSONATE, SAFEARRAY as ComSafeArray,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Ole::{
    SafeArrayAccessData, SafeArrayGetLBound, SafeArrayGetUBound, SafeArrayUnaccessData,
};
#[cfg(target_os = "windows")]
use windows::Win32::System::Variant::{VT_ARRAY, VT_BSTR, VT_UI1};
#[cfg(target_os = "windows")]
use windows::Win32::System::Wmi::{
    IEnumWbemClassObject, IWbemClassObject, IWbemLocator, IWbemServices, WbemLocator,
    WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY, WBEM_INFINITE,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Storage::FileSystem::{
    CreateFileW, FlushFileBuffers, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ, FILE_SHARE_WRITE,
    OPEN_EXISTING,
};

const WARNING_TEMP_C: u8 = 42;
const FAULT_TEMP_C: u8 = 48;
const SENTINEL_INTERVAL: Duration = Duration::from_secs(5);
const SENTINEL_RETRY_INTERVAL: Duration = Duration::from_secs(60);
const JANITOR_SYNC_TIMEOUT: Duration = Duration::from_secs(1);
const RED_PULSE_WINDOW: Duration = Duration::from_millis(120);
const TARGET_LOGICAL_DRIVE: &str = "E:";
const HOTSWAP_VOLUME_LETTER: char = 'V';
const HOTSWAP_SOURCE_PATH: &str = r"V:\Egress\HotSwap.raw";
const HOTSWAP_SNAPSHOT_PATH: &str = r"V:\Archive\HotSwap.raw.fault.snapshot";
const COLD_VAULT_PATH: &str = r"V:\Archive\ColdVault.zst";
const BUNKER_VHD_FILE_NAME: &str = "Bunker.vhd";
const THERMAL_SENSOR_AMBER_INTENSITY: u8 = 153;
#[cfg(target_os = "windows")]
const RAW_FLUSH_ACCESS_MASK: u32 = 0x40000000u32;
#[cfg(target_os = "windows")]
const RAW_FLUSH_SHARE_MASK: u32 = FILE_SHARE_READ | FILE_SHARE_WRITE;
#[cfg(target_os = "windows")]
const RPC_E_TOO_LATE_CODE: i32 = -2147417831;
#[cfg(target_os = "windows")]
const RPC_C_AUTHN_WINNT_VALUE: u32 = 10;
#[cfg(target_os = "windows")]
const RPC_C_AUTHZ_NONE_VALUE: u32 = 0;
static SENTINEL_STARTED: AtomicBool = AtomicBool::new(false);
static SWARM_NODE_BUDGET: AtomicU8 = AtomicU8::new(96);
static SENSOR_OFFLINE_LATCH: AtomicBool = AtomicBool::new(false);

#[derive(Debug, Clone, Serialize)]
pub struct ThermalFaultAudit {
    pub temperature_c: u8,
    pub janitor_flush_dispatch_ms: f64,
    pub unmount_vhd_dispatch_ms: f64,
    pub total_dispatch_ms: f64,
    pub dry_run: bool,
    pub janitor_sync_completed: bool,
    pub flush_file_buffers_verified: bool,
    pub flush_verification: FlushVerificationAudit,
    pub literal_shutdown_dispatched: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FlushVerificationAudit {
    pub volume: FlushTargetAudit,
    pub files: Vec<FlushTargetAudit>,
}

impl FlushVerificationAudit {
    fn verified(&self) -> bool {
        self.volume.flush_succeeded
            && self.files.iter().any(|audit| audit.flush_succeeded)
            && self
                .files
                .iter()
                .filter(|audit| audit.attempted)
                .all(|audit| audit.flush_succeeded)
    }

    fn summary(&self) -> String {
        let mut fragments = Vec::new();

        if !self.volume.flush_succeeded {
            fragments.push(format!(
                "volume {} failed at {}{}",
                self.volume.target,
                self.volume.error_stage.as_deref().unwrap_or("unknown-stage"),
                self.volume
                    .os_error_code
                    .map(|code| format!(" (os error {code})"))
                    .unwrap_or_default()
            ));
        }

        for audit in self.files.iter().filter(|audit| audit.attempted && !audit.flush_succeeded) {
            fragments.push(format!(
                "file {} failed at {}{}",
                audit.target,
                audit.error_stage.as_deref().unwrap_or("unknown-stage"),
                audit
                    .os_error_code
                    .map(|code| format!(" (os error {code})"))
                    .unwrap_or_default()
            ));
        }

        if !self.files.iter().any(|audit| audit.attempted) {
            fragments.push("no HotSwap or ColdVault file targets were present to flush".to_string());
        }

        if fragments.is_empty() {
            "flush verification passed".to_string()
        } else {
            fragments.join("; ")
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct FlushTargetAudit {
    pub target: String,
    pub attempted: bool,
    pub handle_opened: bool,
    pub flush_succeeded: bool,
    pub error_stage: Option<String>,
    pub os_error_code: Option<i32>,
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct HardwareAnchorAudit {
    pub status: String,
    pub volume_letter: char,
    pub volume_root: String,
    pub volume_device_path: String,
    pub bunker_vhd_path: String,
    pub bunker_image_present: bool,
    pub volume_present: bool,
    pub hotswap_present: bool,
    pub archive_present: bool,
    pub ready: bool,
    pub detail: String,
    pub remediation: String,
}

impl HardwareAnchorAudit {
    fn missing(volume_letter: char, bunker_vhd_path: &Path) -> Self {
        let volume_root = format!("{}:\\", volume_letter.to_ascii_uppercase());
        let volume_device_path = format!(r"\\.\{}:", volume_letter.to_ascii_uppercase());
        let bunker_image_present = bunker_vhd_path.exists();
        let detail = format!(
            "bunker volume {} is not mounted or visible to Win32 at {}",
            volume_letter.to_ascii_uppercase(),
            volume_device_path
        );
        Self {
            status: "HARDWARE_ANCHOR_MISSING".to_string(),
            volume_letter,
            volume_root,
            volume_device_path,
            bunker_vhd_path: bunker_vhd_path.display().to_string(),
            bunker_image_present,
            volume_present: false,
            hotswap_present: false,
            archive_present: false,
            ready: false,
            detail,
            remediation: format!(
                "Mount the bunker volume with Tool 06 / diskpart and assign it to {}: before running the stress station",
                volume_letter.to_ascii_uppercase()
            ),
        }
    }

    fn ready(volume_letter: char, bunker_vhd_path: &Path, hotswap_present: bool, archive_present: bool) -> Self {
        let volume_root = format!("{}:\\", volume_letter.to_ascii_uppercase());
        let volume_device_path = format!(r"\\.\{}:", volume_letter.to_ascii_uppercase());
        let status = if hotswap_present && archive_present {
            "READY"
        } else {
            "HARDWARE_LAYOUT_DEGRADED"
        };
        let detail = if hotswap_present && archive_present {
            format!(
                "bunker volume {} is mounted and the HotSwap / ColdVault paths are present",
                volume_letter.to_ascii_uppercase()
            )
        } else {
            format!(
                "bunker volume {} is mounted, but HotSwap present={} ColdVault present={}",
                volume_letter.to_ascii_uppercase(),
                hotswap_present,
                archive_present
            )
        };

        Self {
            status: status.to_string(),
            volume_letter,
            volume_root,
            volume_device_path,
            bunker_vhd_path: bunker_vhd_path.display().to_string(),
            bunker_image_present: bunker_vhd_path.exists(),
            volume_present: true,
            hotswap_present,
            archive_present,
            ready: true,
            detail,
            remediation: "If layout is degraded, run Zero-Forge and Janitor bootstrap on the mounted bunker volume".to_string(),
        }
    }
}

#[derive(Debug, Clone)]
struct BunkerMountResult {
    exit_code: Option<i32>,
    stdout: String,
    stderr: String,
}

fn resolve_bunker_vhd_path(repo_root: &Path) -> PathBuf {
    repo_root.join("vault").join(BUNKER_VHD_FILE_NAME)
}

fn resolve_mount_script_path(repo_root: &Path) -> PathBuf {
    repo_root.join(".tmp").join("tool_06_mount_bunker.ps1")
}

fn write_bunker_mount_script(script_path: &Path) -> Result<(), QuantumError> {
    if let Some(parent) = script_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| QuantumError::IOFailure(format!("failed to create Tool 06 script directory: {error}")))?;
    }

    let script = r#"param(
    [Parameter(Mandatory = $true)][string]$BunkerPath,
    [Parameter(Mandatory = $true)][string]$DriveLetter
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $BunkerPath)) {
    throw "Bunker VHD missing at $BunkerPath"
}

$diskImage = Get-DiskImage -ImagePath $BunkerPath -ErrorAction SilentlyContinue
if ($null -eq $diskImage -or -not $diskImage.Attached) {
    $diskImage = Mount-DiskImage -ImagePath $BunkerPath -Access ReadWrite -PassThru -ErrorAction Stop
}

Start-Sleep -Milliseconds 500

$disk = $diskImage | Get-Disk -ErrorAction Stop
$partition = $disk | Get-Partition | Sort-Object Size -Descending | Select-Object -First 1
if ($null -eq $partition) {
    throw "No partition available after mounting $BunkerPath"
}

$currentLetter = if ($partition.DriveLetter) { [string]$partition.DriveLetter } else { '' }
if ($currentLetter -ne $DriveLetter) {
    $partition | Set-Partition -NewDriveLetter $DriveLetter -ErrorAction Stop | Out-Null
}
"#;

    fs::write(script_path, script)
        .map_err(|error| QuantumError::IOFailure(format!("failed to write Tool 06 mount script: {error}")))
}

fn ps_quote(value: &str) -> String {
    value.replace("'", "''")
}

fn mount_bunker(repo_root: &Path, bunker_vhd_path: &Path) -> Result<BunkerMountResult, QuantumError> {
    write_bunker_mount_script(&resolve_mount_script_path(repo_root))?;
    let script_path = resolve_mount_script_path(repo_root);
    let command = format!(
        "$p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File','{}','-BunkerPath','{}','-DriveLetter','{}'); if ($null -eq $p) {{ exit 1 }}; exit $p.ExitCode",
        ps_quote(&script_path.display().to_string()),
        ps_quote(&bunker_vhd_path.display().to_string()),
        HOTSWAP_VOLUME_LETTER.to_ascii_uppercase()
    );

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &command])
        .output()
        .map_err(|error| QuantumError::IOFailure(format!("failed to launch Tool 06 bunker mount bridge: {error}")))?;

    Ok(BunkerMountResult {
        exit_code: output.status.code(),
        stdout: String::from_utf8_lossy(&output.stdout).trim().to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).trim().to_string(),
    })
}

pub fn hardware_anchor_preflight(repo_root: &Path) -> HardwareAnchorAudit {
    let volume_letter = HOTSWAP_VOLUME_LETTER;
    let bunker_vhd_path = resolve_bunker_vhd_path(repo_root);
    let volume_root_string = format!("{}:\\", volume_letter.to_ascii_uppercase());
    let volume_root = Path::new(&volume_root_string);
    if !volume_root.exists() {
        return HardwareAnchorAudit::missing(volume_letter, &bunker_vhd_path);
    }

    HardwareAnchorAudit::ready(
        volume_letter,
        &bunker_vhd_path,
        Path::new(HOTSWAP_SOURCE_PATH).exists(),
        Path::new(COLD_VAULT_PATH).exists(),
    )
}

pub fn ensure_hardware_anchor_ready(repo_root: &Path) -> Result<HardwareAnchorAudit, QuantumError> {
    let audit = hardware_anchor_preflight(repo_root);
    if audit.ready {
        return Ok(audit);
    }

    let bunker_vhd_path = resolve_bunker_vhd_path(repo_root);
    if !bunker_vhd_path.exists() {
        return Err(QuantumError::CriticalFault(format!(
            "{}: {}. Bunker image missing at {}. Remediation: provision {} before Tool 06 runs.",
            audit.status,
            audit.detail,
            bunker_vhd_path.display(),
            bunker_vhd_path.display()
        )));
    }

    let mount_result = mount_bunker(repo_root, &bunker_vhd_path)?;
    let post_mount = hardware_anchor_preflight(repo_root);
    if !post_mount.ready {
        let stderr_suffix = if mount_result.stderr.is_empty() {
            String::new()
        } else {
            format!(" stderr={}", mount_result.stderr)
        };
        let stdout_suffix = if mount_result.stdout.is_empty() {
            String::new()
        } else {
            format!(" stdout={}", mount_result.stdout)
        };
        return Err(QuantumError::CriticalFault(format!(
            "{}: {}. Tool 06 exit_code={:?}.{}{} Remediation: {}",
            post_mount.status,
            post_mount.detail,
            mount_result.exit_code,
            stdout_suffix,
            stderr_suffix,
            post_mount.remediation
        )));
    }

    Ok(post_mount)
}

#[cfg(target_os = "windows")]
struct NativeThermalSentinel {
    _apartment: ComApartment,
    services: IWbemServices,
    target: DriveThermalTarget,
}

#[cfg(target_os = "windows")]
struct ComApartment;

#[cfg(target_os = "windows")]
#[derive(Debug, Clone)]
struct DriveThermalTarget {
    disk_index: u32,
    pnp_normalized: Option<String>,
    model_normalized: String,
}

pub fn start_sentinel() -> Result<(), QuantumError> {
    if SENTINEL_STARTED.swap(true, Ordering::AcqRel) {
        return Ok(());
    }

    thread::Builder::new()
        .name("quantum-sovereign-sentinel".to_string())
        .spawn(|| {
            let _ = crate::iris::register_pillar_thread_current(1);
            sentinel_loop();
        })
        .map_err(|error| QuantumError::CriticalFault(format!("failed to spawn sovereign sentinel: {error}")))?;
    Ok(())
}

pub fn active_swarm_budget() -> u8 {
    SWARM_NODE_BUDGET.load(Ordering::Acquire)
}

pub fn simulate_thermal_fault(
    repo_root: &Path,
    temperature_c: u8,
    dry_run: bool,
) -> Result<ThermalFaultAudit, QuantumError> {
    let _ = repo_root;
    dispatch_fault_sequence(temperature_c, dry_run)
}

fn sentinel_loop() {
    #[cfg(target_os = "windows")]
    let mut sensor = None;
    #[cfg(target_os = "windows")]
    let mut next_retry_at = Instant::now();

    loop {
        #[cfg(target_os = "windows")]
        {
            if sensor.is_none() && Instant::now() >= next_retry_at {
                match NativeThermalSentinel::connect() {
                    Ok(connected) => {
                        SENSOR_OFFLINE_LATCH.store(false, Ordering::Release);
                        sensor = Some(connected);
                    }
                    Err(error) => {
                        handle_thermal_sensor_offline(&error.to_string());
                        next_retry_at = Instant::now() + SENTINEL_RETRY_INTERVAL;
                    }
                }
            }

            if let Some(active_sensor) = sensor.as_ref() {
                match active_sensor.poll_temperature_celsius() {
                    Ok(temp_c) => {
                        SENSOR_OFFLINE_LATCH.store(false, Ordering::Release);
                        if temp_c >= FAULT_TEMP_C {
                            let _ = dispatch_fault_sequence(temp_c, false);
                            return;
                        }
                        if temp_c >= WARNING_TEMP_C {
                            SWARM_NODE_BUDGET.store(12, Ordering::Release);
                        } else {
                            SWARM_NODE_BUDGET.store(96, Ordering::Release);
                        }
                    }
                    Err(error) => {
                        handle_thermal_sensor_offline(&error.to_string());
                        SWARM_NODE_BUDGET.store(96, Ordering::Release);
                    }
                }
            }
        }

        #[cfg(not(target_os = "windows"))]
        {
            SWARM_NODE_BUDGET.store(96, Ordering::Release);
        }

        thread::sleep(SENTINEL_INTERVAL);
    }
}

fn handle_thermal_sensor_offline(detail: &str) {
    if SENSOR_OFFLINE_LATCH.swap(true, Ordering::AcqRel) {
        return;
    }

    let message = format!("{}: {detail}", SystemError::ThermalSensorOffline.as_str());
    eprintln!("{message}");
    dispatch_surface_packet(SurfaceSignalPacket::new(
        VisualHudCue::OverlayConsumption,
        THERMAL_SENSOR_AMBER_INTENSITY,
    ));

    #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
    {
        if let Ok(ring) = crate::neural::egress_controller::EgressRingBuffer::global() {
            let _ = ring.push_framed_data(message.as_bytes());
        }
    }
}

fn dispatch_fault_sequence(temp_c: u8, dry_run: bool) -> Result<ThermalFaultAudit, QuantumError> {
    let total_start = Instant::now();
    let janitor_start = Instant::now();
    #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
    let janitor_sync_completed = janitor::trigger_sync_pulse_blocking(JANITOR_SYNC_TIMEOUT).unwrap_or(false);
    #[cfg(not(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32"))))]
    let janitor_sync_completed = false;
    let janitor_flush_dispatch_ms = janitor_start.elapsed().as_secs_f64() * 1000.0;

    let flush_verification = verify_flush_file_buffers(&[
        PathBuf::from(HOTSWAP_SOURCE_PATH),
        PathBuf::from(COLD_VAULT_PATH),
    ]);
    let flush_file_buffers_verified = flush_verification.verified();

    eprintln!(
        "0xFF critical fault: sovereign sentinel reached {}C, initiating atomic vault flush and shutdown",
        temp_c
    );

    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::OverlayConsumption, u8::MAX));
    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::PulsarStall, u8::MAX));
    thread::sleep(RED_PULSE_WINDOW);

    let unmount_start = Instant::now();
    copy_fault_snapshot(Path::new(HOTSWAP_SOURCE_PATH), Path::new(HOTSWAP_SNAPSHOT_PATH))?;

    if !flush_file_buffers_verified {
        eprintln!("0xFF flush verification rejected: {}", flush_verification.summary());
    }

    if !dry_run && !flush_file_buffers_verified {
        return Err(QuantumError::IOFailure(format!(
            "failed to verify FlushFileBuffers against the V: volume before shutdown: {}",
            flush_verification.summary()
        )));
    }

    if !dry_run {
        let shutdown_status = Command::new("shutdown.exe")
            .args(["/s", "/t", "0", "/f"])
            .status()
            .map_err(|error| QuantumError::IOFailure(format!("failed to dispatch literal shutdown: {error}")))?;
        if !shutdown_status.success() {
            return Err(QuantumError::IOFailure(format!("literal shutdown command failed with status {shutdown_status}")));
        }
    }

    let unmount_vhd_dispatch_ms = unmount_start.elapsed().as_secs_f64() * 1000.0;
    Ok(ThermalFaultAudit {
        temperature_c: temp_c,
        janitor_flush_dispatch_ms,
        unmount_vhd_dispatch_ms,
        total_dispatch_ms: total_start.elapsed().as_secs_f64() * 1000.0,
        dry_run,
        janitor_sync_completed,
        flush_file_buffers_verified,
        flush_verification,
        literal_shutdown_dispatched: !dry_run,
    })
}

fn copy_fault_snapshot(source: &Path, target: &Path) -> Result<(), QuantumError> {
    if !source.exists() {
        return Ok(());
    }

    with_v_drive_write_lock(target, || {
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| QuantumError::IOFailure(format!("failed to create thermal snapshot directory: {error}")))?;
        }

        fs::copy(source, target).map_err(|error| {
            QuantumError::IOFailure(format!(
                "failed to archive HotSwap fault snapshot from {} to {}: {error}",
                source.display(),
                target.display()
            ))
        })?;
        Ok(())
    })
}

fn verify_flush_file_buffers(paths: &[PathBuf]) -> FlushVerificationAudit {
    FlushVerificationAudit {
        volume: flush_volume_write_cache(HOTSWAP_VOLUME_LETTER),
        files: paths.iter().map(|path| flush_file_buffers_path(path)).collect(),
    }
}

#[cfg(target_os = "windows")]
fn flush_volume_write_cache(letter: char) -> FlushTargetAudit {
    let volume = format!(r"\\.\{}:", letter.to_ascii_uppercase());
    let wide: Vec<u16> = volume.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            RAW_FLUSH_ACCESS_MASK,
            RAW_FLUSH_SHARE_MASK,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );
        if handle == INVALID_HANDLE_VALUE {
            let error = std::io::Error::last_os_error();
            let code = error.raw_os_error();
            return FlushTargetAudit {
                target: volume,
                attempted: true,
                handle_opened: false,
                flush_succeeded: false,
                error_stage: Some("CreateFileW".to_string()),
                os_error_code: code,
                detail: Some(format!("failed to open raw volume handle: {error}")),
            };
        }

        let flushed = FlushFileBuffers(handle);
        if flushed == 0 {
            let error = std::io::Error::last_os_error();
            let code = error.raw_os_error();
            CloseHandle(handle);
            return FlushTargetAudit {
                target: volume,
                attempted: true,
                handle_opened: true,
                flush_succeeded: false,
                error_stage: Some("FlushFileBuffers".to_string()),
                os_error_code: code,
                detail: Some(format!("raw volume flush rejected: {error}")),
            };
        }

        CloseHandle(handle);
    }

    FlushTargetAudit {
        target: volume,
        attempted: true,
        handle_opened: true,
        flush_succeeded: true,
        error_stage: None,
        os_error_code: None,
        detail: None,
    }
}

#[cfg(not(target_os = "windows"))]
fn flush_volume_write_cache(letter: char) -> FlushTargetAudit {
    FlushTargetAudit {
        target: format!(r"\\.\{}:", letter.to_ascii_uppercase()),
        attempted: false,
        handle_opened: false,
        flush_succeeded: false,
        error_stage: Some("platform".to_string()),
        os_error_code: None,
        detail: Some("raw volume flush unsupported on non-Windows targets".to_string()),
    }
}

#[cfg(target_os = "windows")]
fn flush_file_buffers_path(path: &Path) -> FlushTargetAudit {
    let rendered = path.display().to_string();
    if !path.exists() {
        return FlushTargetAudit {
            target: rendered,
            attempted: false,
            handle_opened: false,
            flush_succeeded: false,
            error_stage: None,
            os_error_code: None,
            detail: Some("path missing, skipped".to_string()),
        };
    }

    let wide: Vec<u16> = path
        .as_os_str()
        .to_string_lossy()
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();

    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            RAW_FLUSH_ACCESS_MASK,
            RAW_FLUSH_SHARE_MASK,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );
        if handle == INVALID_HANDLE_VALUE {
            let error = std::io::Error::last_os_error();
            let code = error.raw_os_error();
            return FlushTargetAudit {
                target: rendered,
                attempted: true,
                handle_opened: false,
                flush_succeeded: false,
                error_stage: Some("CreateFileW".to_string()),
                os_error_code: code,
                detail: Some(format!("failed to open file handle for FlushFileBuffers: {error}")),
            };
        }

        let flushed = FlushFileBuffers(handle);
        if flushed == 0 {
            let error = std::io::Error::last_os_error();
            let code = error.raw_os_error();
            CloseHandle(handle);
            return FlushTargetAudit {
                target: rendered,
                attempted: true,
                handle_opened: true,
                flush_succeeded: false,
                error_stage: Some("FlushFileBuffers".to_string()),
                os_error_code: code,
                detail: Some(format!("file flush rejected: {error}")),
            };
        }

        CloseHandle(handle);
    }

    FlushTargetAudit {
        target: rendered,
        attempted: true,
        handle_opened: true,
        flush_succeeded: true,
        error_stage: None,
        os_error_code: None,
        detail: None,
    }
}

#[cfg(not(target_os = "windows"))]
fn flush_file_buffers_path(path: &Path) -> FlushTargetAudit {
    let rendered = path.display().to_string();
    if !path.exists() {
        return FlushTargetAudit {
            target: rendered,
            attempted: false,
            handle_opened: false,
            flush_succeeded: false,
            error_stage: None,
            os_error_code: None,
            detail: Some("path missing, skipped".to_string()),
        };
    }

    match std::fs::OpenOptions::new().read(true).write(true).open(path) {
        Ok(file) => match file.sync_all() {
            Ok(()) => FlushTargetAudit {
                target: rendered,
                attempted: true,
                handle_opened: true,
                flush_succeeded: true,
                error_stage: None,
                os_error_code: None,
                detail: None,
            },
            Err(error) => FlushTargetAudit {
                target: rendered,
                attempted: true,
                handle_opened: true,
                flush_succeeded: false,
                error_stage: Some("sync_all".to_string()),
                os_error_code: error.raw_os_error(),
                detail: Some(format!("sync_all failed: {error}")),
            },
        },
        Err(error) => FlushTargetAudit {
            target: rendered,
            attempted: true,
            handle_opened: false,
            flush_succeeded: false,
            error_stage: Some("open".to_string()),
            os_error_code: error.raw_os_error(),
            detail: Some(format!("failed to open file for sync: {error}")),
        },
    }
}

#[cfg(target_os = "windows")]
impl NativeThermalSentinel {
    fn connect() -> Result<Self, QuantumError> {
        let apartment = ComApartment::initialize()?;
        let locator: IWbemLocator = unsafe {
            CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| QuantumError::IOFailure(format!("failed to create WMI locator: {error}")))?
        };
        let cimv2 = connect_namespace(&locator, "ROOT\\CIMV2")?;
        let services = connect_namespace(&locator, "ROOT\\WMI")?;
        let target = resolve_drive_target(&cimv2)?;
        Ok(Self {
            _apartment: apartment,
            services,
            target,
        })
    }

    fn poll_temperature_celsius(&self) -> Result<u8, QuantumError> {
        let query = "SELECT InstanceName, VendorSpecific FROM MSStorageDriver_ATAPISmartData";
        let enumerator = exec_query(&self.services, query)?;
        let mut objects = [None::<IWbemClassObject>];
        loop {
            let mut returned = 0u32;
            let result = unsafe { enumerator.Next(WBEM_INFINITE, &mut objects, &mut returned) };
            if result.is_err() {
                return Err(QuantumError::IOFailure(format!(
                    "WMI SMART query iteration failed with HRESULT 0x{:08X}",
                    result.0 as u32
                )));
            }
            if returned == 0 {
                break;
            }

            if let Some(object) = objects[0].take() {
                let instance_name = get_wmi_string(&object, "InstanceName")?;
                if !self.target.matches_instance(&instance_name) {
                    continue;
                }

                let vendor = get_wmi_byte_array(&object, "VendorSpecific")?;
                if let Some(temp_c) = parse_smart_temperature(&vendor) {
                    return Ok(temp_c);
                }
            }
        }

        Err(QuantumError::IOFailure(format!(
            "no SMART temperature attribute found for logical drive {} (disk #{})",
            TARGET_LOGICAL_DRIVE,
            self.target.disk_index
        )))
    }
}

#[cfg(target_os = "windows")]
impl DriveThermalTarget {
    fn matches_instance(&self, instance_name: &str) -> bool {
        let normalized_instance = normalize_identifier(instance_name);
        if let Some(pnp) = &self.pnp_normalized {
            if normalized_instance.contains(pnp) {
                return true;
            }
        }
        normalized_instance.contains(&self.model_normalized)
    }
}

#[cfg(target_os = "windows")]
impl ComApartment {
    fn initialize() -> Result<Self, QuantumError> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED)
                .ok()
                .map_err(|error| QuantumError::IOFailure(format!("failed to initialize COM apartment: {error}")))?;
            match CoInitializeSecurity(
                None,
                -1,
                None,
                None,
                RPC_C_AUTHN_LEVEL_DEFAULT,
                RPC_C_IMP_LEVEL_IMPERSONATE,
                None,
                EOAC_NONE,
                None,
            ) {
                Ok(()) => {}
                Err(error) if error.code().0 == RPC_E_TOO_LATE_CODE => {}
                Err(error) => {
                    return Err(QuantumError::IOFailure(format!(
                        "failed to initialize COM security: {error}"
                    )))
                }
            }
        }
        Ok(Self)
    }
}

#[cfg(target_os = "windows")]
impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe {
            CoUninitialize();
        }
    }
}

#[cfg(target_os = "windows")]
fn connect_namespace(locator: &IWbemLocator, namespace: &str) -> Result<IWbemServices, QuantumError> {
    let namespace_bstr = BSTR::from(namespace);
    let services = unsafe {
        locator
            .ConnectServer(&namespace_bstr, None, None, None, 0, None, None)
            .map_err(|error| QuantumError::IOFailure(format!("failed to connect to WMI namespace {namespace}: {error}")))?
    };
    unsafe {
        CoSetProxyBlanket(
            &services,
            RPC_C_AUTHN_WINNT_VALUE,
            RPC_C_AUTHZ_NONE_VALUE,
            PCWSTR::null(),
            RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            None,
            EOAC_NONE,
        )
        .map_err(|error| QuantumError::IOFailure(format!("failed to set WMI proxy blanket for {namespace}: {error}")))?;
    }
    Ok(services)
}

#[cfg(target_os = "windows")]
fn resolve_drive_target(cimv2: &IWbemServices) -> Result<DriveThermalTarget, QuantumError> {
    let partition_query = format!(
        "ASSOCIATORS OF {{Win32_LogicalDisk.DeviceID='{}'}} WHERE AssocClass = Win32_LogicalDiskToPartition",
        TARGET_LOGICAL_DRIVE
    );
    let partition_enum = exec_query(cimv2, &partition_query)?;
    let partition = next_wmi_object(&partition_enum)?.ok_or_else(|| {
        QuantumError::IOFailure(format!(
            "no partition mapping found for logical drive {}",
            TARGET_LOGICAL_DRIVE
        ))
    })?;
    let partition_device = get_wmi_string(&partition, "DeviceID")?;
    let disk_index = parse_disk_index(&partition_device).ok_or_else(|| {
        QuantumError::IOFailure(format!(
            "failed to parse disk index from partition mapping {partition_device}"
        ))
    })?;

    let disk_query = format!(
        "SELECT Index, Model, PNPDeviceID FROM Win32_DiskDrive WHERE Index = {}",
        disk_index
    );
    let disk_enum = exec_query(cimv2, &disk_query)?;
    let disk = next_wmi_object(&disk_enum)?.ok_or_else(|| {
        QuantumError::IOFailure(format!(
            "no Win32_DiskDrive row found for disk index {}",
            disk_index
        ))
    })?;

    let model = get_wmi_string(&disk, "Model")?;
    let pnp = get_wmi_string_optional(&disk, "PNPDeviceID")?;
    let model_normalized = normalize_identifier(&model);
    if !model_normalized.contains("SEAGATE") {
        return Err(QuantumError::IOFailure(format!(
            "logical drive {} resolved to non-Seagate model {}",
            TARGET_LOGICAL_DRIVE,
            model
        )));
    }

    Ok(DriveThermalTarget {
        disk_index,
        pnp_normalized: pnp.map(|value| normalize_identifier(&value)).filter(|value| !value.is_empty()),
        model_normalized,
    })
}

#[cfg(target_os = "windows")]
fn exec_query(services: &IWbemServices, query: &str) -> Result<IEnumWbemClassObject, QuantumError> {
    let wql = BSTR::from("WQL");
    let query_bstr = BSTR::from(query);
    unsafe {
        services
            .ExecQuery(
                &wql,
                &query_bstr,
                WBEM_FLAG_FORWARD_ONLY | WBEM_FLAG_RETURN_IMMEDIATELY,
                None,
            )
            .map_err(|error| QuantumError::IOFailure(format!("WMI query failed for `{query}`: {error}")))
    }
}

#[cfg(target_os = "windows")]
fn next_wmi_object(enumerator: &IEnumWbemClassObject) -> Result<Option<IWbemClassObject>, QuantumError> {
    let mut objects = [None::<IWbemClassObject>];
    let mut returned = 0u32;
    let result = unsafe { enumerator.Next(WBEM_INFINITE, &mut objects, &mut returned) };
    if result.is_err() {
        return Err(QuantumError::IOFailure(format!(
            "WMI enumeration failed with HRESULT 0x{:08X}",
            result.0 as u32
        )));
    }
    Ok(if returned == 0 { None } else { objects[0].take() })
}

#[cfg(target_os = "windows")]
fn get_wmi_string(object: &IWbemClassObject, property: &str) -> Result<String, QuantumError> {
    get_wmi_string_optional(object, property)?.ok_or_else(|| {
        QuantumError::IOFailure(format!("WMI property {property} was empty"))
    })
}

#[cfg(target_os = "windows")]
fn get_wmi_string_optional(object: &IWbemClassObject, property: &str) -> Result<Option<String>, QuantumError> {
    let wide: Vec<u16> = property.encode_utf16().chain(std::iter::once(0)).collect();
    let mut variant = VARIANT::new();
    unsafe {
        object
            .Get(PCWSTR(wide.as_ptr()), 0, &mut variant, None, None)
            .map_err(|error| QuantumError::IOFailure(format!("failed to read WMI property {property}: {error}")))?;
    }
    let vt = unsafe { variant.as_raw().Anonymous.Anonymous.vt };
    if vt != VT_BSTR.0 {
        return Ok(None);
    }
    Ok(BSTR::try_from(&variant).ok().map(|value| value.to_string()))
}

#[cfg(target_os = "windows")]
fn get_wmi_byte_array(object: &IWbemClassObject, property: &str) -> Result<[u8; 512], QuantumError> {
    let wide: Vec<u16> = property.encode_utf16().chain(std::iter::once(0)).collect();
    let mut variant = VARIANT::new();
    unsafe {
        object
            .Get(PCWSTR(wide.as_ptr()), 0, &mut variant, None, None)
            .map_err(|error| QuantumError::IOFailure(format!("failed to read WMI property {property}: {error}")))?;
    }
    let vt = unsafe { variant.as_raw().Anonymous.Anonymous.vt };
    let expected = VT_ARRAY.0 | VT_UI1.0;
    if vt != expected {
        return Err(QuantumError::IOFailure(format!(
            "unexpected WMI VARIANT type for {property}: {}",
            vt
        )));
    }

    let parray = unsafe { variant.as_raw().Anonymous.Anonymous.Anonymous.parray as *const ComSafeArray };
    if parray.is_null() {
        return Err(QuantumError::IOFailure(format!("WMI byte array {property} was null")));
    }

    let lower = unsafe { SafeArrayGetLBound(parray, 1) }
        .map_err(|error| QuantumError::IOFailure(format!("failed to read SAFEARRAY lower bound for {property}: {error}")))?;
    let upper = unsafe { SafeArrayGetUBound(parray, 1) }
        .map_err(|error| QuantumError::IOFailure(format!("failed to read SAFEARRAY upper bound for {property}: {error}")))?;
    let len = upper.saturating_sub(lower).saturating_add(1) as usize;
    let mut data = std::ptr::null_mut();
    unsafe { SafeArrayAccessData(parray, &mut data) }
        .map_err(|error| QuantumError::IOFailure(format!("failed to access SAFEARRAY data for {property}: {error}")))?;
    let mut buffer = [0u8; 512];
    let copy_len = len.min(buffer.len());
    unsafe {
        std::ptr::copy_nonoverlapping(data.cast::<u8>(), buffer.as_mut_ptr(), copy_len);
        SafeArrayUnaccessData(parray)
            .map_err(|error| QuantumError::IOFailure(format!("failed to release SAFEARRAY data for {property}: {error}")))?;
    }
    Ok(buffer)
}

#[cfg(target_os = "windows")]
fn parse_smart_temperature(vendor: &[u8; 512]) -> Option<u8> {
    for offset in (2..362).step_by(12) {
        let attribute_id = vendor[offset];
        if attribute_id == 194 || attribute_id == 190 {
            let temperature = vendor[offset + 5];
            if (1..=120).contains(&temperature) {
                return Some(temperature);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn parse_disk_index(partition_device: &str) -> Option<u32> {
    partition_device
        .split(',')
        .find_map(|segment| segment.trim().strip_prefix("Disk #"))
        .and_then(|value| value.trim().parse::<u32>().ok())
}

#[cfg(target_os = "windows")]
fn normalize_identifier(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(|ch| ch.to_uppercase())
        .collect()
}

