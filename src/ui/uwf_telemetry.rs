#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::models::QuantumError;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ui::surface_projection::dispatch_surface_packet;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::process::Command;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::thread;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::time::Duration;

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const UWF_POLL_INTERVAL: Duration = Duration::from_secs(60);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const UWF_CRITICAL_THRESHOLD_PERCENT: u8 = 95;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static UWF_MONITOR_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static UWF_REBOOT_LATCH: AtomicBool = AtomicBool::new(false);

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn start_uwf_monitor() -> Result<(), QuantumError> {
    if UWF_MONITOR_STARTED.swap(true, Ordering::AcqRel) {
        return Ok(());
    }

    thread::Builder::new()
        .name("quantum-uwf-monitor".to_string())
        .spawn(move || { let _ = crate::iris::register_pillar_thread_current(1); uwf_monitor_loop() })
        .map_err(|error| QuantumError::CriticalFault(format!("failed to spawn UWF monitor: {error}")))?;
    Ok(())
}

#[cfg(not(all(feature = "desktop", not(target_arch = "wasm32"))))]
pub fn start_uwf_monitor() -> Result<(), crate::models::QuantumError> {
    Ok(())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn uwf_monitor_loop() {
    loop {
        if let Ok(consumption_percent) = sample_overlay_consumption_percent() {
            dispatch_surface_packet(SurfaceSignalPacket::new(
                VisualHudCue::OverlayConsumption,
                normalize_overlay_percent(consumption_percent),
            ));

            if consumption_percent > UWF_CRITICAL_THRESHOLD_PERCENT {
                trigger_system_save_and_stall(consumption_percent);
                return;
            }
        }

        thread::sleep(UWF_POLL_INTERVAL);
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn sample_overlay_consumption_percent() -> Result<u8, QuantumError> {
    let script = r#"
$percent = $null
try {
    $config = (& uwfmgr.exe get-config 2>$null | Out-String)
    if ($config -match '(\d{1,3})\s*%') {
        $percent = [int]$matches[1]
    }
} catch {}
if ($null -eq $percent) {
    try {
        $overlay = Get-CimInstance -Namespace 'root\standardcimv2\embedded' -ClassName 'UWF_Overlay' -ErrorAction Stop
        if ($overlay -and $overlay.MaximumSize -gt 0) {
            $percent = [int][Math]::Round(($overlay.CurrentSize / $overlay.MaximumSize) * 100)
        }
    } catch {}
}
if ($null -eq $percent) { $percent = 0 }
Write-Output $percent
"#;

    let output = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .output()
        .map_err(|error| QuantumError::IOFailure(format!("failed to poll UWF overlay: {error}")))?;

    if !output.status.success() {
        return Err(QuantumError::IOFailure(format!(
            "UWF overlay poll failed with status {}",
            output.status
        )));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let percent = stdout.trim().parse::<u8>().unwrap_or(0).min(100);
    Ok(percent)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn normalize_overlay_percent(percent: u8) -> u8 {
    ((percent as u16 * 255) / 100) as u8
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn trigger_system_save_and_stall(consumption_percent: u8) {
    if UWF_REBOOT_LATCH.swap(true, Ordering::AcqRel) {
        return;
    }

    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::OverlayConsumption, u8::MAX));
    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::PulsarStall, u8::MAX));
    eprintln!(
        "0xFF critical fault: UWF overlay consumption exceeded threshold at {}%",
        consumption_percent
    );

    let _ = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "$source = 'V:\\Egress\\HotSwap.raw'; $target = 'V:\\Archive\\HotSwapRingBuffer.snapshot'; if (Test-Path $source) { Copy-Item -LiteralPath $source -Destination $target -Force }; shutdown.exe /r /t 0 /f",
        ])
        .spawn();
}




