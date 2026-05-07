use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
use crate::models::{QuantumError, SystemError};
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
    CreateFileW, FlushFileBuffers, FILE_ATTRIBUTE_NORMAL, FILE_SHARE_DELETE, FILE_SHARE_READ,
    FILE_SHARE_WRITE, OPEN_EXISTING,
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
const THERMAL_SENSOR_AMBER_INTENSITY: u8 = 153;
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
    pub literal_shutdown_dispatched: bool,
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

    let flush_file_buffers_verified = verify_flush_file_buffers(&[
        PathBuf::from(HOTSWAP_SOURCE_PATH),
        PathBuf::from(COLD_VAULT_PATH),
    ]);

    eprintln!(
        "0xFF critical fault: sovereign sentinel reached {}C, initiating atomic vault flush and shutdown",
        temp_c
    );

    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::OverlayConsumption, u8::MAX));
    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::PulsarStall, u8::MAX));
    thread::sleep(RED_PULSE_WINDOW);

    let unmount_start = Instant::now();
    copy_fault_snapshot(Path::new(HOTSWAP_SOURCE_PATH), Path::new(HOTSWAP_SNAPSHOT_PATH))?;

    if !dry_run && !flush_file_buffers_verified {
        return Err(QuantumError::IOFailure(
            "failed to verify FlushFileBuffers against the V: volume before shutdown".into(),
        ));
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
        literal_shutdown_dispatched: !dry_run,
    })
}

fn copy_fault_snapshot(source: &Path, target: &Path) -> Result<(), QuantumError> {
    if !source.exists() {
        return Ok(());
    }

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
}

fn verify_flush_file_buffers(paths: &[PathBuf]) -> bool {
    let volume_flushed = flush_volume_write_cache(HOTSWAP_VOLUME_LETTER).unwrap_or(false);
    if !volume_flushed {
        return false;
    }

    let mut any_file_flushed = false;
    for path in paths {
        match flush_file_buffers_path(path) {
            Ok(true) => any_file_flushed = true,
            Ok(false) => {}
            Err(_) => return false,
        }
    }
    any_file_flushed
}

#[cfg(target_os = "windows")]
fn flush_volume_write_cache(letter: char) -> Result<bool, QuantumError> {
    let volume = format!(r"\\.\{}:", letter.to_ascii_uppercase());
    let wide: Vec<u16> = volume.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        let handle = CreateFileW(
            wide.as_ptr(),
            0x80000000u32 | 0x40000000u32,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );
        if handle == INVALID_HANDLE_VALUE {
            return Ok(false);
        }
        let flushed = FlushFileBuffers(handle);
        CloseHandle(handle);
        if flushed == 0 {
            return Err(QuantumError::IOFailure(format!(
                "FlushFileBuffers failed for volume {}",
                volume
            )));
        }
    }
    Ok(true)
}

#[cfg(not(target_os = "windows"))]
fn flush_volume_write_cache(_letter: char) -> Result<bool, QuantumError> {
    Ok(false)
}

#[cfg(target_os = "windows")]
fn flush_file_buffers_path(path: &Path) -> Result<bool, QuantumError> {
    if !path.exists() {
        return Ok(false);
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
            0x80000000u32 | 0x40000000u32,
            FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
            std::ptr::null(),
            OPEN_EXISTING,
            FILE_ATTRIBUTE_NORMAL,
            std::ptr::null_mut(),
        );
        if handle == INVALID_HANDLE_VALUE {
            return Err(QuantumError::IOFailure(format!(
                "failed to open {} for FlushFileBuffers",
                path.display()
            )));
        }
        let flushed = FlushFileBuffers(handle);
        CloseHandle(handle);
        if flushed == 0 {
            return Err(QuantumError::IOFailure(format!(
                "FlushFileBuffers failed for {}",
                path.display()
            )));
        }
    }

    Ok(true)
}

#[cfg(not(target_os = "windows"))]
fn flush_file_buffers_path(path: &Path) -> Result<bool, QuantumError> {
    if !path.exists() {
        return Ok(false);
    }
    let file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)
        .map_err(|error| QuantumError::IOFailure(format!("failed to open {} for sync: {error}", path.display())))?;
    file.sync_all()
        .map_err(|error| QuantumError::IOFailure(format!("sync_all failed for {}: {error}", path.display())))?;
    Ok(true)
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
