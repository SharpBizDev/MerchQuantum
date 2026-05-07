use crate::models::QuantumError;
use crate::neural::egress_controller::EgressRingBuffer;
use crate::ui::surface_projection::dispatch_surface_packet;
use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::OnceLock;
use std::thread;
use std::time::Duration;

const JANITOR_ARCHIVE_PATH: &str = r"V:\Archive\ColdVault.zst";
static JANITOR_TX: OnceLock<Sender<JanitorCommand>> = OnceLock::new();

enum JanitorCommand {
    Sync(Option<Sender<Result<bool, String>>>),
}

pub fn ignite_janitor() -> Result<(), QuantumError> {
    if JANITOR_TX.get().is_some() {
        return Ok(());
    }

    let controller = EgressRingBuffer::global()?;
    let (tx, rx) = mpsc::channel::<JanitorCommand>();
    thread::Builder::new()
        .name("quantum-egress-janitor".to_string())
        .spawn(move || {
            let _ = crate::iris::register_swarm_thread_current("janitor");
            loop {
                match rx.recv_timeout(Duration::from_secs(60)) {
                    Ok(JanitorCommand::Sync(reply)) => {
                        let result = sync_once(&controller).map_err(|error| error.to_string());
                        if let Some(reply) = reply {
                            let _ = reply.send(result.clone());
                        }
                    }
                    Err(RecvTimeoutError::Timeout) => {
                        let _ = sync_once(&controller);
                    }
                    Err(RecvTimeoutError::Disconnected) => break,
                }
            }
        })
        .map_err(|error| QuantumError::CriticalFault(format!("failed to spawn janitor thread: {error}")))?;

    let _ = JANITOR_TX.set(tx);
    Ok(())
}

pub fn trigger_sync_pulse() -> Result<(), QuantumError> {
    let tx = JANITOR_TX
        .get()
        .ok_or_else(|| QuantumError::CriticalFault("janitor not ignited".into()))?;
    tx.send(JanitorCommand::Sync(None))
        .map_err(|error| QuantumError::CriticalFault(format!("janitor pulse send failed: {error}")))
}

pub fn trigger_sync_pulse_blocking(timeout: Duration) -> Result<bool, QuantumError> {
    let tx = JANITOR_TX
        .get()
        .ok_or_else(|| QuantumError::CriticalFault("janitor not ignited".into()))?;
    let (reply_tx, reply_rx) = mpsc::channel();
    tx.send(JanitorCommand::Sync(Some(reply_tx)))
        .map_err(|error| QuantumError::CriticalFault(format!("janitor blocking pulse send failed: {error}")))?;
    match reply_rx.recv_timeout(timeout) {
        Ok(Ok(flushed)) => Ok(flushed),
        Ok(Err(message)) => Err(QuantumError::IOFailure(message)),
        Err(error) => Err(QuantumError::CriticalFault(format!("janitor blocking pulse timeout: {error}"))),
    }
}

fn sync_once(controller: &EgressRingBuffer) -> Result<bool, QuantumError> {
    let Some(claim) = controller.claim_for_janitor()? else {
        return Ok(false);
    };

    let archive_path = PathBuf::from(JANITOR_ARCHIVE_PATH);
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| QuantumError::IOFailure(format!("failed to create archive directory: {error}")))?;
    }

    let compressed = zstd::stream::encode_all(&claim.bytes[..], 3)
        .map_err(|error| QuantumError::IOFailure(format!("janitor compression failed: {error}")))?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&archive_path)
        .map_err(|error| QuantumError::IOFailure(format!("failed to open ColdVault.zst: {error}")))?;
    file.write_all(&compressed)
        .map_err(|error| QuantumError::IOFailure(format!("failed to append ColdVault.zst: {error}")))?;
    file.flush()
        .map_err(|error| QuantumError::IOFailure(format!("failed to flush ColdVault.zst: {error}")))?;

    controller.release_claim(claim);
    dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::JanitorPulse, 0xFF));
    Ok(true)
}
