#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::models::QuantumError;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::neural::egress_controller::{EgressRingBuffer, MmapSentinelReader, HOTSWAP_BYTES, HOTSWAP_PAGE_BYTES, HOTSWAP_SENTINEL_BYTES};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::neural::janitor;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ui::surface_projection::dispatch_surface_packet;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use memmap2::{Mmap, MmapOptions};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::fs::File;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::path::{Path, PathBuf};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, AtomicUsize, Ordering};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::{Mutex, OnceLock};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::thread;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::time::{Duration, SystemTime, UNIX_EPOCH};

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const DEFAULT_MODEL_PATH: &str = "vault/models/llama-3-8b-instruct-q4_k_m.gguf";
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const IDLE_WAIT: Duration = Duration::from_millis(8);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const BUFFER_ALPHA: u8 = 0;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const BUFFER_BETA: u8 = 1;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const NEURAL_EGRESS_BUFFER_BYTES: usize = 512 * 1024;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const HUMAN_FIRST_THRESHOLD: u8 = 0x80;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const HUMAN_STALL_WINDOW_MS: u64 = 1_200;

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static NEURAL_CORE: OnceLock<Sender<NeuralIngressPacket>> = OnceLock::new();
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static NEURAL_EGRESS_ZONE: OnceLock<PingPongBuffer> = OnceLock::new();
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static HUMAN_FIRST_STALL: AtomicBool = AtomicBool::new(false);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static HUMAN_FIRST_STALL_UNTIL_MS: AtomicU64 = AtomicU64::new(0);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static HUMAN_FIRST_DROP_REQUEST: AtomicBool = AtomicBool::new(false);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static LAST_HUMAN_INTENSITY: AtomicU8 = AtomicU8::new(0);

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Debug, Clone, Copy)]
pub enum NeuralIngressRoute {
    LibrarianPlane,
    AsrBridge,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Debug, Clone)]
pub struct NeuralIngressPacket {
    pub route: NeuralIngressRoute,
    pub category_id: Option<u8>,
    pub purified_text: String,
    pub amplitude_hint: u8,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Debug, Clone)]
pub struct NeuralCommandResponse {
    pub canonical_command: String,
    pub arguments: Vec<String>,
    pub synthesized_voice: String,
    pub confidence: f32,
    pub route: NeuralIngressRoute,
    pub category_id: Option<u8>,
    pub model_status: &'static str,
    pub model_bytes_mmapped: usize,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
struct NeuralModelView {
    mmap: Option<Mmap>,
    model_status: &'static str,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub struct PingPongBuffer {
    alpha: Mutex<Box<[u8; NEURAL_EGRESS_BUFFER_BYTES]>>,
    beta: Mutex<Box<[u8; NEURAL_EGRESS_BUFFER_BYTES]>>,
    buffer_owner: AtomicU8,
    alpha_len: AtomicUsize,
    beta_len: AtomicUsize,
    updated: AtomicBool,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
impl PingPongBuffer {
    fn new() -> Self {
        Self {
            alpha: Mutex::new(Box::new([0u8; NEURAL_EGRESS_BUFFER_BYTES])),
            beta: Mutex::new(Box::new([0u8; NEURAL_EGRESS_BUFFER_BYTES])),
            buffer_owner: AtomicU8::new(BUFFER_ALPHA),
            alpha_len: AtomicUsize::new(0),
            beta_len: AtomicUsize::new(0),
            updated: AtomicBool::new(false),
        }
    }

    fn owner(&self) -> u8 {
        self.buffer_owner.load(Ordering::Acquire) & 1
    }

    fn published_index(&self) -> u8 {
        self.owner() ^ 1
    }

    fn len_for(&self, index: u8) -> usize {
        if index == BUFFER_ALPHA {
            self.alpha_len.load(Ordering::Acquire)
        } else {
            self.beta_len.load(Ordering::Acquire)
        }
    }

    fn write_buffer(&self) -> (&Mutex<Box<[u8; NEURAL_EGRESS_BUFFER_BYTES]>>, u8) {
        let owner = self.owner();
        if owner == BUFFER_ALPHA {
            (&self.alpha, BUFFER_ALPHA)
        } else {
            (&self.beta, BUFFER_BETA)
        }
    }

    fn publish_and_swap(&self, written_index: u8, written_len: usize) {
        if written_index == BUFFER_ALPHA {
            self.alpha_len.store(written_len, Ordering::Release);
            self.buffer_owner.store(BUFFER_BETA, Ordering::Release);
        } else {
            self.beta_len.store(written_len, Ordering::Release);
            self.buffer_owner.store(BUFFER_ALPHA, Ordering::Release);
        }
        self.updated.store(true, Ordering::Release);
    }

    fn clear(&self) {
        if let Ok(mut alpha) = self.alpha.lock() {
            alpha.fill(0);
        }
        if let Ok(mut beta) = self.beta.lock() {
            beta.fill(0);
        }
        self.alpha_len.store(0, Ordering::Release);
        self.beta_len.store(0, Ordering::Release);
        self.buffer_owner.store(BUFFER_ALPHA, Ordering::Release);
        self.updated.store(true, Ordering::Release);
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn egress_zone() -> &'static PingPongBuffer {
    NEURAL_EGRESS_ZONE.get_or_init(PingPongBuffer::new)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn neural_egress_zone_len() -> usize {
    let zone = egress_zone();
    zone.len_for(zone.published_index())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn take_neural_egress_update_flag() -> bool {
    egress_zone().updated.swap(false, Ordering::AcqRel)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn clear_neural_egress_zone() {
    egress_zone().clear();
    dispatch_surface_packet(SurfaceSignalPacket::new(
        VisualHudCue::NeuralStreamComplete,
        0,
    ));
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn observe_human_voice_intensity(intensity: u8) -> bool {
    LAST_HUMAN_INTENSITY.store(intensity, Ordering::Release);

    if intensity > HUMAN_FIRST_THRESHOLD {
        let deadline = now_epoch_ms().saturating_add(HUMAN_STALL_WINDOW_MS);
        HUMAN_FIRST_STALL_UNTIL_MS.store(deadline, Ordering::Release);
        HUMAN_FIRST_STALL.store(true, Ordering::Release);
        HUMAN_FIRST_DROP_REQUEST.store(true, Ordering::Release);
        return true;
    }

    if intensity < 0x20 {
        HUMAN_FIRST_STALL_UNTIL_MS.store(0, Ordering::Release);
        HUMAN_FIRST_STALL.store(false, Ordering::Release);
        HUMAN_FIRST_DROP_REQUEST.store(false, Ordering::Release);
    }

    human_first_stall_active()
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn current_human_voice_intensity() -> u8 {
    LAST_HUMAN_INTENSITY.load(Ordering::Acquire)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn human_first_stall_active() -> bool {
    let active = HUMAN_FIRST_STALL.load(Ordering::Acquire);
    if !active {
        return false;
    }

    let deadline = HUMAN_FIRST_STALL_UNTIL_MS.load(Ordering::Acquire);
    if deadline == 0 || now_epoch_ms() <= deadline {
        return true;
    }

    HUMAN_FIRST_STALL.store(false, Ordering::Release);
    HUMAN_FIRST_DROP_REQUEST.store(false, Ordering::Release);
    false
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn human_first_drop_requested() -> bool {
    HUMAN_FIRST_DROP_REQUEST.load(Ordering::Acquire)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn clear_human_first_drop_request() {
    HUMAN_FIRST_DROP_REQUEST.store(false, Ordering::Release);
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn ignition(repo_root: PathBuf) -> Result<(), QuantumError> {
    if NEURAL_CORE.get().is_some() {
        return Ok(());
    }

    let ring = EgressRingBuffer::initialize()?;
    parallel_ignition_sweep(ring.path())?;
    let heartbeat_before = MmapSentinelReader::open()?.heartbeat_value();
    let heartbeat_after = ring.warm_up_and_prime()?;
    let telemetry = MmapSentinelReader::open()?;
    if !telemetry.heartbeat_alive() || telemetry.heartbeat_value() <= heartbeat_before || telemetry.heartbeat_value() != heartbeat_after {
        return Err(QuantumError::CriticalFault(
            "0xFF HotSwap heartbeat flatline after warm-up sweep".into(),
        ));
    }

    janitor::ignite_janitor()?;

    let (tx, rx) = mpsc::channel::<NeuralIngressPacket>();
    let worker_repo_root = repo_root.clone();
    thread::Builder::new()
        .name("quantum-neural-core".to_string())
        .spawn(move || { let _ = crate::iris::register_swarm_thread_current("neural-core"); neural_thread_main(worker_repo_root, rx) })
        .map_err(|error| QuantumError::CriticalFault(format!("failed to spawn neural core thread: {error}")))?;

    let _ = NEURAL_CORE.set(tx);
    Ok(())
}

pub fn ignite_neural_core(repo_root: PathBuf) -> Result<(), QuantumError> {
    ignition(repo_root)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn enqueue_purified_text(packet: NeuralIngressPacket) -> Result<(), QuantumError> {
    let sender = NEURAL_CORE
        .get()
        .ok_or_else(|| QuantumError::CriticalFault("neural core not ignited".into()))?;
    sender
        .send(packet)
        .map_err(|error| QuantumError::CriticalFault(format!("neural ingress send failed: {error}")))
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn parallel_ignition_sweep(path: &Path) -> Result<(), QuantumError> {
    let worker_count = thread::available_parallelism()
        .map(|parallelism| parallelism.get())
        .unwrap_or(1)
        .max(1);
    let stride = HOTSWAP_PAGE_BYTES.saturating_mul(worker_count);
    let mut handles = Vec::with_capacity(worker_count);

    for worker_index in 0..worker_count {
        let path = path.to_path_buf();
        handles.push(
            thread::Builder::new()
                .name(format!("quantum-page-touch-{worker_index}"))
                .spawn(move || -> Result<u8, QuantumError> {
                    let file = File::open(&path).map_err(|error| {
                        QuantumError::IOFailure(format!("failed to open HotSwap.raw for parallel ignition: {error}"))
                    })?;
                    let mmap = unsafe {
                        MmapOptions::new()
                            .len(HOTSWAP_BYTES)
                            .map(&file)
                            .map_err(|error| {
                                QuantumError::IOFailure(format!(
                                    "failed to mmap HotSwap.raw for parallel ignition: {error}"
                                ))
                            })?
                    };

                    let mut checksum = 0u8;
                    let mut offset = HOTSWAP_SENTINEL_BYTES + worker_index.saturating_mul(HOTSWAP_PAGE_BYTES);
                    while offset < HOTSWAP_BYTES {
                        checksum ^= std::hint::black_box(mmap[offset]);
                        offset = offset.saturating_add(stride);
                    }
                    Ok(checksum)
                })
                .map_err(|error| {
                    QuantumError::CriticalFault(format!(
                        "failed to spawn parallel ignition worker {worker_index}: {error}"
                    ))
                })?,
        );
    }

    let mut combined_checksum = 0u8;
    for handle in handles {
        let checksum = handle
            .join()
            .map_err(|_| QuantumError::CriticalFault("parallel ignition worker panicked".into()))??;
        combined_checksum ^= checksum;
    }

    std::hint::black_box(combined_checksum);
    Ok(())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]fn neural_thread_main(repo_root: PathBuf, rx: Receiver<NeuralIngressPacket>) {
    let model = load_model_view(&repo_root);
    loop {
        match rx.recv_timeout(IDLE_WAIT) {
            Ok(packet) => {
                let response = infer_structured_response(&packet, &model);
                stream_response_to_egress_zone(&response, packet.amplitude_hint);
                thread::yield_now();
            }
            Err(RecvTimeoutError::Timeout) => {
                thread::yield_now();
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn load_model_view(repo_root: &Path) -> NeuralModelView {
    let model_path = repo_root.join(DEFAULT_MODEL_PATH);
    let file = File::open(&model_path).ok();
    let mmap = file.and_then(|handle| unsafe { MmapOptions::new().map(&handle).ok() });
    let model_status = if mmap.is_some() { "mmapped" } else { "quarantined" };
    NeuralModelView {
        mmap,
        model_status,
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn infer_structured_response(packet: &NeuralIngressPacket, model: &NeuralModelView) -> NeuralCommandResponse {
    let lower = packet.purified_text.to_ascii_lowercase();
    let (canonical_command, arguments, confidence) = if lower.contains("publish") {
        ("publish_listing".to_string(), vec!["channel=marketplace".to_string()], 0.92)
    } else if lower.contains("pause") {
        ("pause_pulsar".to_string(), vec!["scope=rotation".to_string()], 0.84)
    } else if lower.contains("resume") {
        ("resume_pulsar".to_string(), vec!["scope=rotation".to_string()], 0.84)
    } else if lower.contains("refine") || lower.contains("metadata") {
        (
            "refine_metadata".to_string(),
            vec![format!("chars={}", packet.purified_text.chars().count())],
            0.88,
        )
    } else {
        (
            "synthesize_response".to_string(),
            vec![format!("excerpt={}", preview(&packet.purified_text))],
            0.72,
        )
    };

    let synthesized_voice = match packet.route {
        NeuralIngressRoute::LibrarianPlane => format!(
            "Forge aligned category {} with command {}",
            packet.category_id.map(|id| format!("{id:02}")).unwrap_or_else(|| "unknown".to_string()),
            canonical_command
        ),
        NeuralIngressRoute::AsrBridge => format!("Voice route resolved to {}", canonical_command),
    };

    NeuralCommandResponse {
        canonical_command,
        arguments,
        synthesized_voice,
        confidence,
        route: packet.route,
        category_id: packet.category_id,
        model_status: model.model_status,
        model_bytes_mmapped: model.mmap.as_ref().map(|view| view.len()).unwrap_or(0),
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn stream_response_to_egress_zone(response: &NeuralCommandResponse, amplitude_hint: u8) {
    let body = format!(
        "command={}\nargs={}\nvoice={}\nconfidence={:.3}\nmodel_status={}\nmodel_bytes_mmapped={}\n",
        response.canonical_command,
        response.arguments.join(","),
        response.synthesized_voice,
        response.confidence,
        response.model_status,
        response.model_bytes_mmapped,
    );

    let zone = egress_zone();
    let (buffer_lock, write_index) = zone.write_buffer();

    if let Ok(mut bytes) = buffer_lock.lock() {
        bytes.fill(0);
        let mut cursor = write_body(&mut bytes[..], body.as_bytes());

        for (token_index, token) in body.split_whitespace().enumerate() {
            let packet = SurfaceSignalPacket::new(
                VisualHudCue::AiVoiceEgress,
                token_probability_intensity(token, response.confidence, amplitude_hint, token_index),
            );
            dispatch_surface_packet(packet);
            cursor = write_token_marker(&mut bytes[..], cursor, token);
            thread::yield_now();
        }

        zone.publish_and_swap(write_index, cursor);
        if let Ok(controller) = EgressRingBuffer::global() {
            if let Ok(depth) = controller.push_framed_data(&bytes[..cursor]) {
                dispatch_surface_packet(SurfaceSignalPacket::new(
                    VisualHudCue::HotSwapDepth,
                    depth,
                ));
            }
        }
    }

    dispatch_surface_packet(SurfaceSignalPacket::new(
        VisualHudCue::NeuralStreamComplete,
        0,
    ));
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn write_body(buffer: &mut [u8], body: &[u8]) -> usize {
    let max_write = body.len().min(buffer.len().saturating_sub(1));
    buffer[..max_write].copy_from_slice(&body[..max_write]);
    max_write
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn token_probability_intensity(token: &str, confidence: f32, amplitude_hint: u8, token_index: usize) -> u8 {
    let lexical_weight = (token.len().min(12) as f32 / 12.0).clamp(0.0, 1.0);
    let base_probability = (confidence * 0.74) + (lexical_weight * 0.18) + ((amplitude_hint as f32 / 255.0) * 0.08);
    let probability = base_probability.clamp(0.02, 0.985);
    let log_odds = (probability / (1.0 - probability)).ln().abs();
    let shimmer_bias = if token_index % 2 == 0 { 1.08 } else { 0.94 };
    ((log_odds * 38.0 * shimmer_bias).round()).clamp(0.0, 255.0) as u8
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn write_token_marker(buffer: &mut [u8], cursor: usize, token: &str) -> usize {
    if cursor >= buffer.len().saturating_sub(1) {
        return cursor;
    }
    let marker = format!("[tok:{}]", token);
    let token_bytes = marker.as_bytes();
    let remaining = buffer.len().saturating_sub(cursor + 1);
    let write_len = token_bytes.len().min(remaining);
    buffer[cursor..cursor + write_len].copy_from_slice(&token_bytes[..write_len]);
    let next = cursor + write_len;
    if next < buffer.len() {
        buffer[next] = b'\n';
        next + 1
    } else {
        next
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn preview(value: &str) -> String {
    let mut preview = value.split_whitespace().take(12).collect::<Vec<_>>().join(" ");
    if value.split_whitespace().count() > 12 {
        preview.push_str("...");
    }
    preview
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}




