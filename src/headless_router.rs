#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::models::QuantumError;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use std::path::PathBuf;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use tokio::net::windows::named_pipe::{NamedPipeServer, ServerOptions};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
pub const MASTER_PIPE_NAME: &str = r"\\.\pipe\quantum_core_master";

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
const ACK_SUCCESS: u8 = 0x00;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
const ACK_VAULT: u8 = 0x01;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
const ACK_INVALID_FORGE_PACKET: u8 = 0x02;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
const ACK_INVALID_IMAGE: u8 = 0x03;
const ACK_QUEUE_CONGESTION: u8 = 0x04;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
const ACK_CRITICAL_FAULT: u8 = 0xff;

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
pub async fn run_headless_router(worker_count: usize) -> Result<(), QuantumError> {
    crate::pulsar::start_ingestion_queue(worker_count.max(1));

    loop {
        let mut server = create_pipe_server()?;
        server
            .connect()
            .await
            .map_err(|error| QuantumError::CriticalFault(format!("named pipe connect failed: {error}")))?;

        let mut request = Vec::new();
        server
            .read_to_end(&mut request)
            .await
            .map_err(|error| QuantumError::CriticalFault(format!("named pipe read failed: {error}")))?;

        let archive_path = parse_archive_path(&request)?;
        let ack = match crate::pulsar::try_enqueue_archive_ingestion(&archive_path) {
            Ok(()) => ACK_SUCCESS,
            Err(crate::pulsar::IngressEnqueueError::QueueFull) => ACK_QUEUE_CONGESTION,
            Err(crate::pulsar::IngressEnqueueError::QueueUnavailable) => {
                quantum_error_code(&QuantumError::CriticalFault("pulsar ingress queue unavailable".into()))
            }
        };
        server
            .write_all(&[ack])
            .await
            .map_err(|error| QuantumError::CriticalFault(format!("named pipe write failed: {error}")))?;
        let _ = server.flush().await;
        let _ = server.disconnect();
    }
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn create_pipe_server() -> Result<NamedPipeServer, QuantumError> {
    ServerOptions::new()
        .first_pipe_instance(false)
        .create(MASTER_PIPE_NAME)
        .map_err(|error| QuantumError::CriticalFault(format!("named pipe create failed: {error}")))
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn parse_archive_path(request: &[u8]) -> Result<PathBuf, QuantumError> {
    let path = std::str::from_utf8(request)
        .map_err(|error| QuantumError::InvalidForgePacket(format!("pipe payload utf8 invalid: {error}")))?
        .trim_matches(char::from(0))
        .trim();

    if path.is_empty() {
        return Err(QuantumError::InvalidForgePacket("pipe payload missing archive path".into()));
    }

    Ok(PathBuf::from(path))
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn quantum_error_code(error: &QuantumError) -> u8 {
    match error {
        QuantumError::Vault(_) => ACK_VAULT,
        QuantumError::InvalidForgePacket(_) => ACK_INVALID_FORGE_PACKET,
        QuantumError::InvalidImageDataUrl => ACK_INVALID_IMAGE,
        QuantumError::CriticalFault(_) => ACK_CRITICAL_FAULT,
        _ => ACK_CRITICAL_FAULT,
    }
}
