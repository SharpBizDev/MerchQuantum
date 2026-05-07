#[cfg(feature = "micro-cell")]
use crate::cold_vault::{archive_chunk, now_epoch_ms as cold_vault_epoch_ms, store_seed, ColdVaultRecord};
#[cfg(feature = "micro-cell")]
use crate::governor::{bloom_subject, evaluate_relevance, sector_articulation, topic_id_for_subject, OverUnityGate};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::ipc::signals::VisualHudCue;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::neural::engine::{
    clear_human_first_drop_request,
    clear_neural_egress_zone,
    current_human_voice_intensity,
    human_first_drop_requested,
    human_first_stall_active,
};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::neural::janitor;
#[cfg(feature = "micro-cell")]
use crate::micro_cell::{LibrarianIngressPayload, LibrarianIngressRecord, QuantumMicroCell};
#[cfg(feature = "micro-cell")]
use crate::models::ProvenanceHeader;
#[cfg(feature = "micro-cell")]
use crate::synthesis::duality::BelieverSkeptic;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::ui::surface_projection::dispatch_visual_cue;
#[cfg(feature = "micro-cell")]
use serde::Deserialize;
#[cfg(feature = "micro-cell")]
use std::collections::VecDeque;
use std::fs;
#[cfg(feature = "micro-cell")]
use std::path::{Path, PathBuf};
#[cfg(feature = "micro-cell")]
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
#[cfg(feature = "micro-cell")]
use std::sync::{Arc, Mutex, OnceLock};
#[cfg(feature = "micro-cell")]
use std::thread;
#[cfg(feature = "micro-cell")]
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(feature = "micro-cell")]
use tokio::time::MissedTickBehavior;

#[cfg(feature = "micro-cell")]
const CATEGORY_RING_SIZE: u8 = 96;
#[cfg(feature = "micro-cell")]
const PULSAR_CADENCE: Duration = Duration::from_millis(37_500);
#[cfg(feature = "micro-cell")]
const CONTENT_PREVIEW_LIMIT: usize = 160;
const REFINEMENT_PREEMPT_DENSITY: usize = 4;

#[cfg(feature = "micro-cell")]
static PULSAR_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(feature = "micro-cell")]
static PULSAR_SCHEDULER: OnceLock<Arc<PulsarScheduler>> = OnceLock::new();
#[cfg(feature = "micro-cell")]
static PULSAR_INGESTION_QUEUE: OnceLock<Arc<AtomicIngressQueue>> = OnceLock::new();
#[cfg(feature = "micro-cell")]
static PULSAR_REFINEMENT_QUEUE: OnceLock<Arc<AtomicIngressQueue>> = OnceLock::new();
#[cfg(feature = "micro-cell")]
static ACTIVE_RESEARCH_TASK: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PulsarStatus {
    RefinedTruth,
    WaitingForFuel,
}

#[cfg(feature = "micro-cell")]
impl PulsarStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::RefinedTruth => "REFINED_TRUTH",
            Self::WaitingForFuel => "WAITING_FOR_FUEL",
        }
    }
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct InputChunk {
    pub chunk_id: String,
    pub mime_hint: String,
    pub content_excerpt: String,
    pub zero_copy_block: String,
    pub source_path: Option<String>,
    pub provenance_header: ProvenanceHeader,
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct PulsarEmission {
    pub target_category: u8,
    pub status: PulsarStatus,
    pub queue_path: String,
    pub input_chunk: InputChunk,
    pub refined_truth_yaml: String,
    pub emitted_at_epoch_ms: u128,
    pub findings: Vec<String>,
    pub serialization_overhead_ms: f32,
    pub archive_path: Option<String>,
    pub archive_hash: Option<String>,
    pub purifier_fired: bool,
    pub relevance_score: f32,
    pub force_protocol_triggered: bool,
    pub rearticulated_subject: Option<String>,
}

#[cfg(feature = "micro-cell")]
pub struct PulsarScheduler {
    pointer: AtomicU8,
}

#[cfg(feature = "micro-cell")]
struct AtomicIngressQueue {
    slots: Mutex<VecDeque<PathBuf>>,
    capacity: usize,
}

pub enum IngressEnqueueError {
    QueueUnavailable,
    QueueFull,
}

impl AtomicIngressQueue {
    fn new(capacity: usize) -> Self {
        Self {
            slots: Mutex::new(VecDeque::with_capacity(capacity)),
            capacity,
        }
    }

    fn try_push(&self, archive_path: PathBuf) -> Result<(), IngressEnqueueError> {
        let mut slots = self
            .slots
            .lock()
            .map_err(|_| IngressEnqueueError::QueueUnavailable)?;
        if slots.len() >= self.capacity {
            return Err(IngressEnqueueError::QueueFull);
        }
        slots.push_back(archive_path);
        Ok(())
    }

    fn try_pop(&self) -> Option<PathBuf> {
        self.slots.lock().ok()?.pop_front()
    }

    fn len(&self) -> usize {
        self.slots.lock().map(|slots| slots.len()).unwrap_or(0)
    }
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, Deserialize)]
struct PulsarQueue {
    categories: Vec<PulsarQueueEntry>,
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, Deserialize)]
struct PulsarQueueEntry {
    category_id: u8,
    research_file_path: String,
    #[serde(default)]
    mime_hint: Option<String>,
    #[serde(default)]
    source_url: Option<String>,
    #[serde(default)]
    subject: Option<String>,
}

#[cfg(feature = "micro-cell")]
enum FuelLoad {
    Ready {
        source_path: PathBuf,
        mime_hint: String,
        content: Vec<u8>,
        source_url: String,
        subject: String,
    },
    Waiting {
        reason: String,
    },
}

#[cfg(feature = "micro-cell")]
impl PulsarScheduler {
    pub fn new() -> Self {
        Self {
            pointer: AtomicU8::new(0),
        }
    }

    pub fn current_category(&self) -> u8 {
        self.pointer.load(Ordering::SeqCst)
    }

    fn next_category(&self) -> u8 {
        self.pointer
            .fetch_update(Ordering::SeqCst, Ordering::SeqCst, |current| {
                Some((current + 1) % CATEGORY_RING_SIZE)
            })
            .unwrap_or(0)
    }

    pub async fn tick<P: AsRef<Path>>(&self, manifest_path: P) -> Result<PulsarEmission, String> {
        let target_category = self.next_category();
        let manifest_path = manifest_path.as_ref();
        let repo_root = manifest_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .to_path_buf();
        let queue_path = repo_root.join("pulsar_queue.json");

        let emission = match load_fuel(target_category, &queue_path) {
            FuelLoad::Ready {
                source_path,
                mime_hint,
                content,
                source_url,
                subject,
            } => {
                let bloom = bloom_subject(&subject);
                let topic_id = topic_id_for_subject(&bloom.subject);
                let sector_subject = bloom
                    .sectors
                    .iter()
                    .find(|sector| sector.sector_id == target_category)
                    .map(|sector| sector.articulation.clone())
                    .unwrap_or_else(|| sector_articulation(&bloom.subject, target_category));
                let provenance_header = ProvenanceHeader {
                    topic_id,
                    sector_id: target_category,
                    source_url: source_url.clone(),
                    timestamp_epoch_ms: cold_vault_epoch_ms(),
                    parent_crc32: crc32fast::hash(&content),
                };
                let cold_vault = archive_chunk(&repo_root, provenance_header.clone(), &content)?;
                let input_chunk = build_input_chunk(
                    target_category,
                    mime_hint,
                    summarize_content(&content),
                    Some(source_path.display().to_string()),
                    provenance_header,
                );
                let payload = LibrarianIngressPayload {
                    corpus_id: format!("category-{target_category:02}"),
                    embedding_model: "sbert-compact".to_string(),
                    authority: "Quantum Forge".to_string(),
                    records: vec![LibrarianIngressRecord {
                        source_label: input_chunk
                            .source_path
                            .clone()
                            .unwrap_or_else(|| input_chunk.zero_copy_block.clone()),
                        mime_hint: input_chunk.mime_hint.clone(),
                        content_excerpt: input_chunk.content_excerpt.clone(),
                        fuel: None,
                    }],
                };

                let micro_cell = QuantumMicroCell::new().map_err(|error| error.to_string())?;
                let archive_path = cold_vault.archive_path.display().to_string();
                let archive_hash = cold_vault.sha256_hex.clone();
                let handle = tokio::spawn(async move {
                    micro_cell
                        .instantiate_diskless_librarian(
                            payload,
                            content,
                            Some(archive_path),
                            Some(archive_hash),
                        )
                        .await
                        .map_err(|error| error.to_string())
                });

                let micro_cell = handle
                    .await
                    .map_err(|join_error| join_error.to_string())??;
                let gate = evaluate_relevance(
                    &sector_subject,
                    &micro_cell.purified_text,
                    &micro_cell.librarian_plane.yaml_manifest(),
                );
                if matches!(gate, OverUnityGate::ForceProtocol { .. }) {
                    let _ = enqueue_refinement_task(&cold_vault.archive_path);
                }

                build_refined_emission(
                    target_category,
                    &queue_path,
                    input_chunk,
                    cold_vault,
                    micro_cell,
                    gate,
                )
            }
            FuelLoad::Waiting { reason } => build_waiting_emission(target_category, &queue_path, reason),
        };

        write_manifest(manifest_path, &emission)?;
        Ok(emission)
    }
}

#[cfg(feature = "micro-cell")]
impl Default for PulsarScheduler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "micro-cell")]
pub fn scheduler() -> Arc<PulsarScheduler> {
    PULSAR_SCHEDULER
        .get_or_init(|| Arc::new(PulsarScheduler::new()))
        .clone()
}

#[cfg(feature = "micro-cell")]
pub fn default_manifest_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("vault_manifest.yaml")
}

#[cfg(feature = "micro-cell")]
pub fn start_ingestion_queue(worker_count: usize) {
    if PULSAR_INGESTION_QUEUE.get().is_some() {
        return;
    }

    let capacity = worker_count.saturating_mul(4).max(8);
    let _ = PULSAR_INGESTION_QUEUE.set(Arc::new(AtomicIngressQueue::new(capacity)));
    let _ = PULSAR_REFINEMENT_QUEUE.set(Arc::new(AtomicIngressQueue::new(capacity)));
}

pub fn try_enqueue_archive_ingestion<P: AsRef<Path>>(
    archive_path: P,
) -> Result<(), IngressEnqueueError> {
    let queue = PULSAR_INGESTION_QUEUE
        .get()
        .ok_or(IngressEnqueueError::QueueUnavailable)?;
    queue.try_push(archive_path.as_ref().to_path_buf())
}

pub fn enqueue_refinement_task<P: AsRef<Path>>(
    archive_path: P,
) -> Result<(), IngressEnqueueError> {
    let queue = PULSAR_REFINEMENT_QUEUE
        .get()
        .ok_or(IngressEnqueueError::QueueUnavailable)?;
    queue.try_push(archive_path.as_ref().to_path_buf())
}

fn active_research_task() -> &'static Mutex<Option<PathBuf>> {
    ACTIVE_RESEARCH_TASK.get_or_init(|| Mutex::new(None))
}

fn set_active_research_task(path: &Path) -> Result<(), String> {
    let mut slot = active_research_task()
        .lock()
        .map_err(|_| "active research task lock poisoned".to_string())?;
    *slot = Some(path.to_path_buf());
    Ok(())
}

fn clear_active_research_task() {
    if let Ok(mut slot) = active_research_task().lock() {
        *slot = None;
    }
}

fn describe_enqueue_error(error: IngressEnqueueError) -> &'static str {
    match error {
        IngressEnqueueError::QueueUnavailable => "queue unavailable",
        IngressEnqueueError::QueueFull => "queue full",
    }
}

fn recoil_active_research_task() -> Result<(), String> {
    let archive_path = {
        let mut slot = active_research_task()
            .lock()
            .map_err(|_| "active research task lock poisoned".to_string())?;
        slot.take()
    };

    let Some(archive_path) = archive_path else {
        return Ok(());
    };

    clear_neural_egress_zone();
    clear_human_first_drop_request();
    try_enqueue_archive_ingestion(&archive_path)
        .map_err(|error| format!("cold vault recoil enqueue failed: {}", describe_enqueue_error(error)))
}
async fn release_queued_ingestion_pulse() {
    #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
    if human_first_stall_active() {
        dispatch_visual_cue(VisualHudCue::PulsarStall);
        return;
    }

    let Some(ingestion_queue) = PULSAR_INGESTION_QUEUE.get() else {
        return;
    };
    let refinement_queue = PULSAR_REFINEMENT_QUEUE.get();

    let standard_density = ingestion_queue.len();
    let archive_path = if standard_density >= REFINEMENT_PREEMPT_DENSITY {
        refinement_queue.and_then(|queue| queue.try_pop()).or_else(|| ingestion_queue.try_pop())
    } else {
        ingestion_queue.try_pop().or_else(|| refinement_queue.and_then(|queue| queue.try_pop()))
    };

    let Some(archive_path) = archive_path else {
        return;
    };

    let micro_cell = match QuantumMicroCell::new() {
        Ok(cell) => cell,
        Err(_) => return,
    };

    let _ = process_archive_ingestion(micro_cell, &archive_path, 0).await;
}
async fn process_archive_ingestion(
    micro_cell: QuantumMicroCell,
    archive_path: &Path,
    worker_id: usize,
) -> Result<(), String> {
    set_active_research_task(archive_path)?;

    let result = async {
        if human_first_stall_active() && human_first_drop_requested() {
            let _ = recoil_active_research_task();
            return Err(format!("recoiled active research chunk {}", archive_path.display()));
        }

        let raw_bytes = crate::cold_vault::inflate_archive(archive_path)?;
        if human_first_stall_active() && human_first_drop_requested() {
            let _ = recoil_active_research_task();
            return Err(format!("recoiled active research chunk {}", archive_path.display()));
        }

        let content_excerpt = std::str::from_utf8(&raw_bytes)
            .map_err(|error| format!("archive utf8 invalid: {error}"))?
            .chars()
            .take(160)
            .collect::<String>();

        let payload = LibrarianIngressPayload {
            corpus_id: format!("ipc-worker-{worker_id:02}"),
            embedding_model: "sbert-compact".to_string(),
            authority: "Quantum Forge".to_string(),
            records: vec![LibrarianIngressRecord {
                source_label: archive_path.display().to_string(),
                mime_hint: "text/plain".to_string(),
                content_excerpt,
                fuel: None,
            }],
        };

        let archive_label = archive_path.display().to_string();
        let archive_hash = archive_path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string());
        let mut worker = tokio::spawn(async move {
            micro_cell
                .instantiate_diskless_librarian(payload, raw_bytes, Some(archive_label), archive_hash)
                .await
                .map_err(|error| error.to_string())
        });

        let micro_cell = loop {
            if human_first_stall_active() && human_first_drop_requested() {
                worker.abort();
                let _ = recoil_active_research_task();
                return Err(format!("recoiled active research chunk {}", archive_path.display()));
            }

            tokio::select! {
                result = &mut worker => {
                    let joined = result.map_err(|join_error| join_error.to_string())??;
                    break joined;
                }
                _ = tokio::time::sleep(Duration::from_millis(8)) => {}
            }
        };

        if human_first_stall_active() && human_first_drop_requested() {
            let _ = recoil_active_research_task();
            return Err(format!("recoiled active research chunk {}", archive_path.display()));
        }

        let refined_yaml = micro_cell.librarian_plane.yaml_manifest();
        let _ = crate::neural::engine::enqueue_purified_text(crate::neural::engine::NeuralIngressPacket {
            route: crate::neural::engine::NeuralIngressRoute::LibrarianPlane,
            category_id: category_id_from_archive_path(archive_path),
            purified_text: micro_cell.purified_text.clone(),
            amplitude_hint: category_id_from_archive_path(archive_path)
                .map(|id| ((id as u16 * 255) / 95) as u8)
                .unwrap_or(0),
        });

        let mut synthesis = BelieverSkeptic::execute(&micro_cell.purified_text, &refined_yaml);
        if let Some(seed) = synthesis.novelty_seed.as_mut() {
            let category_id = category_id_from_archive_path(archive_path).unwrap_or(0);
            seed.category_id = Some(category_id);
            let repo_root = repo_root_from_archive_path(archive_path)
                .ok_or_else(|| format!("unable to resolve repo root for {}", archive_path.display()))?;
                        let provenance_header = ProvenanceHeader {
                topic_id: category_id as u32,
                sector_id: category_id,
                source_url: format!("coldvault://novelty/{}", archive_path.display()),
                timestamp_epoch_ms: cold_vault_epoch_ms(),
                parent_crc32: seed.skeptic_crc32,
            };
            let _ = store_seed(repo_root, provenance_header, seed)?;
            #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
            dispatch_visual_cue(VisualHudCue::Novelty);
        }

        Ok(())
    }.await;

    clear_active_research_task();
    if result.is_ok() {
        clear_human_first_drop_request();
    }
    result
}
pub fn start_background(manifest_path: PathBuf) {
    if PULSAR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let scheduler = scheduler();
    thread::spawn(move || {
        let _ = crate::iris::register_swarm_thread_current("pulsar");
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build();

        let Ok(runtime) = runtime else {
            return;
        };

        runtime.block_on(async move {
            let mut interval = tokio::time::interval(PULSAR_CADENCE);
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);
            loop {
                interval.tick().await;
                #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
                dispatch_visual_cue(VisualHudCue::Pulse);
                #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
                if current_human_voice_intensity() < 0x10 {
                    let _ = janitor::trigger_sync_pulse();
                }
                release_queued_ingestion_pulse().await;
                #[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
                if human_first_stall_active() {
                    dispatch_visual_cue(VisualHudCue::PulsarStall);
                    continue;
                }
                let path = manifest_path.clone();
                let _ = scheduler.tick(path).await;
            }
        });
    });
}

#[cfg(feature = "micro-cell")]
fn build_refined_emission(
    target_category: u8,
    queue_path: &Path,
    input_chunk: InputChunk,
    cold_vault: ColdVaultRecord,
    micro_cell: crate::micro_cell::QuantumMicroCellHandle,
    gate: OverUnityGate,
) -> PulsarEmission {
    let mut findings = Vec::new();
    let (relevance_score, force_protocol_triggered, rearticulated_subject) = match gate {
        OverUnityGate::Stable { relevance } => (relevance, false, None),
        OverUnityGate::ForceProtocol {
            relevance,
            rearticulated_subject,
        } => {
            findings.push(format!("FORCE_PROTOCOL: {}", rearticulated_subject));
            (relevance, true, Some(rearticulated_subject))
        }
    };

    PulsarEmission {
        target_category,
        status: PulsarStatus::RefinedTruth,
        queue_path: queue_path.display().to_string(),
        input_chunk,
        refined_truth_yaml: micro_cell.librarian_plane.yaml_manifest(),
        emitted_at_epoch_ms: now_epoch_ms(),
        findings,
        serialization_overhead_ms: micro_cell.serialization_overhead_ms,
        archive_path: Some(cold_vault.archive_path.display().to_string()),
        archive_hash: Some(cold_vault.sha256_hex),
        purifier_fired: micro_cell.purifier_fired,
        relevance_score,
        force_protocol_triggered,
        rearticulated_subject,
    }
}

#[cfg(feature = "micro-cell")]
fn load_fuel(target_category: u8, queue_path: &Path) -> FuelLoad {
    let queue_raw = match fs::read_to_string(queue_path) {
        Ok(raw) => raw,
        Err(_) => {
            return FuelLoad::Waiting {
                reason: format!(
                    "WAITING_FOR_FUEL: missing pulsar_queue.json for category-{target_category:02}"
                ),
            }
        }
    };

    let queue: PulsarQueue = match serde_json::from_str(&queue_raw) {
        Ok(queue) => queue,
        Err(error) => {
            return FuelLoad::Waiting {
                reason: format!(
                    "WAITING_FOR_FUEL: invalid pulsar_queue.json for category-{target_category:02}: {error}"
                ),
            }
        }
    };

    let Some(entry) = queue.categories.iter().find(|entry| entry.category_id == target_category) else {
        return FuelLoad::Waiting {
            reason: format!(
                "WAITING_FOR_FUEL: no queue entry for category-{target_category:02}"
            ),
        };
    };

    let source_path = resolve_fuel_path(queue_path, &entry.research_file_path);
    let content = match fs::read(&source_path) {
        Ok(content) => content,
        Err(_) => {
            return FuelLoad::Waiting {
                reason: format!(
                    "WAITING_FOR_FUEL: missing research file '{}' for category-{target_category:02}",
                    source_path.display()
                ),
            }
        }
    };

    FuelLoad::Ready {
        source_path: source_path.clone(),
        mime_hint: entry
            .mime_hint
            .clone()
            .unwrap_or_else(|| infer_mime_hint(&entry.research_file_path)),
        content,
        source_url: entry
            .source_url
            .clone()
            .unwrap_or_else(|| source_path.display().to_string()),
        subject: entry
            .subject
            .clone()
            .unwrap_or_else(|| format!("CommandQuantum sector {target_category:02}")),
    }
}

#[cfg(feature = "micro-cell")]
fn category_id_from_archive_path(archive_path: &Path) -> Option<u8> {
    archive_path
        .parent()?
        .file_name()?
        .to_str()?
        .parse::<u8>()
        .ok()
}

fn repo_root_from_archive_path(archive_path: &Path) -> Option<PathBuf> {
    let mut current = archive_path.parent()?;
    loop {
        if current.file_name().and_then(|name| name.to_str()) == Some("vault") {
            return current.parent().map(|path| path.to_path_buf());
        }
        current = current.parent()?;
    }
}

fn resolve_fuel_path(queue_path: &Path, research_file_path: &str) -> PathBuf {
    let candidate = PathBuf::from(research_file_path);
    if candidate.is_absolute() {
        candidate
    } else {
        queue_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(candidate)
    }
}

#[cfg(feature = "micro-cell")]
fn build_input_chunk(
    target_category: u8,
    mime_hint: String,
    content_excerpt: String,
    source_path: Option<String>,
    provenance_header: ProvenanceHeader,
) -> InputChunk {
    InputChunk {
        chunk_id: format!("chunk-{target_category:02}"),
        mime_hint,
        content_excerpt,
        zero_copy_block: format!("block://vault/category/{target_category:02}"),
        source_path,
        provenance_header,
    }
}

#[cfg(feature = "micro-cell")]
fn build_waiting_emission(target_category: u8, queue_path: &Path, reason: String) -> PulsarEmission {
    PulsarEmission {
        target_category,
        status: PulsarStatus::WaitingForFuel,
        queue_path: queue_path.display().to_string(),
        input_chunk: build_input_chunk(
            target_category,
            "text/plain".to_string(),
            reason.clone(),
            None,
            ProvenanceHeader {
                topic_id: 0,
                sector_id: target_category,
                source_url: queue_path.display().to_string(),
                timestamp_epoch_ms: cold_vault_epoch_ms(),
                parent_crc32: 0,
            },
        ),
        refined_truth_yaml: format!(
            "authority: Quantum Forge\nlibrarian_plane:\n  status: WAITING_FOR_FUEL\n  requested_category: category-{target_category:02}\n  note: {}\n  serialization_overhead_ms: 0.0",
            sanitize_yaml_scalar(&reason)
        ),
        emitted_at_epoch_ms: now_epoch_ms(),
        findings: vec![reason],
        serialization_overhead_ms: 0.0,
        archive_path: None,
        archive_hash: None,
        purifier_fired: false,
        relevance_score: 0.0,
        force_protocol_triggered: false,
        rearticulated_subject: None,
    }
}

#[cfg(feature = "micro-cell")]
fn infer_mime_hint(path: &str) -> String {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| match extension.to_ascii_lowercase().as_str() {
            "yaml" | "yml" => "application/yaml",
            "json" => "application/json",
            "md" => "text/markdown",
            "txt" => "text/plain",
            _ => "application/octet-stream",
        })
        .unwrap_or("application/octet-stream")
        .to_string()
}

#[cfg(feature = "micro-cell")]
fn summarize_content(content: &[u8]) -> String {
    let text = String::from_utf8_lossy(content);
    let squashed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = squashed.chars().take(CONTENT_PREVIEW_LIMIT).collect::<String>();
    if squashed.chars().count() > CONTENT_PREVIEW_LIMIT {
        preview.push_str("...");
    }
    preview
}

#[cfg(feature = "micro-cell")]
fn write_manifest(path: &Path, emission: &PulsarEmission) -> Result<(), String> {
    let manifest = render_manifest(emission);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(path, manifest).map_err(|error| error.to_string())
}

#[cfg(feature = "micro-cell")]
fn render_manifest(emission: &PulsarEmission) -> String {
    let source_path = emission
        .input_chunk
        .source_path
        .clone()
        .unwrap_or_else(|| "WAITING_FOR_FUEL".to_string());
    let findings_block = if emission.findings.is_empty() {
        "findings: []".to_string()
    } else {
        format!(
            "findings:\n{}",
            emission
                .findings
                .iter()
                .map(|finding| format!("  - {}", sanitize_yaml_scalar(finding)))
                .collect::<Vec<_>>()
                .join("\n")
        )
    };
    let archive_path = emission
        .archive_path
        .clone()
        .unwrap_or_else(|| "none".to_string());
    let archive_hash = emission
        .archive_hash
        .clone()
        .unwrap_or_else(|| "none".to_string());

    format!(
        "authority: Quantum Forge\nruntime:\n  native_bridge: wry-ipc\n  state_owner: rust-single-writer\n  surface: ContextQuantum Refinery\nlibrarian:\n  role: Agent Librarian\n  exchange: vault-manifest-v1\n  embedding_model: sbert-compact\n  output_format: yaml\nbranches:\n  ui:\n    name: feature/quantum-refinery-core\n  native:\n    name: feature/quantum-sensory-core\nprotocol:\n  target_category: {category}\n  status: {status}\n  serialization_overhead_ms: {serialization_overhead_ms:.1}\n  purifier_fired: {purifier_fired}\n  relevance_score: {relevance_score:.3}\n  force_protocol_triggered: {force_protocol_triggered}\n  rearticulated_subject: {rearticulated_subject}\nprovenance:\n  topic_id: {topic_id}\n  sector_id: {sector_id}\n  source_url: {provenance_source_url}\n  timestamp_epoch_ms: {timestamp_epoch_ms}\n  parent_crc32: {parent_crc32}\n  forge_writes:\n    queue_file: {queue_path}\n    input_chunk:\n      chunk_id: {chunk_id}\n      mime_hint: {mime_hint}\n      zero_copy_block: {zero_copy_block}\n      source_path: {source_path}\n      content_excerpt: {excerpt}\n  cold_vault:\n    archive_path: {archive_path}\n    sha256: {archive_hash}\n  micro_cell_reads:\n    designated_memory_block: {zero_copy_block}\n    zero_copy: true\n  micro_cell_emits:\n    refined_truth: |\n{refined_truth}\nlast_tick:\n  emitted_at_epoch_ms: {emitted_at}\n  category_pointer_after_tick: {next_category}\n{findings}\n",
        category = emission.target_category,
        status = emission.status.as_str(),
        serialization_overhead_ms = emission.serialization_overhead_ms,
        purifier_fired = emission.purifier_fired,
        relevance_score = emission.relevance_score,
        force_protocol_triggered = emission.force_protocol_triggered,
        rearticulated_subject = sanitize_yaml_scalar(emission.rearticulated_subject.as_deref().unwrap_or("none")),
        topic_id = emission.input_chunk.provenance_header.topic_id,
        sector_id = emission.input_chunk.provenance_header.sector_id,
        provenance_source_url = sanitize_yaml_scalar(&emission.input_chunk.provenance_header.source_url),
        timestamp_epoch_ms = emission.input_chunk.provenance_header.timestamp_epoch_ms,
        parent_crc32 = emission.input_chunk.provenance_header.parent_crc32,
        queue_path = sanitize_yaml_scalar(&emission.queue_path),
        chunk_id = sanitize_yaml_scalar(&emission.input_chunk.chunk_id),
        mime_hint = sanitize_yaml_scalar(&emission.input_chunk.mime_hint),
        zero_copy_block = sanitize_yaml_scalar(&emission.input_chunk.zero_copy_block),
        source_path = sanitize_yaml_scalar(&source_path),
        excerpt = sanitize_yaml_scalar(&emission.input_chunk.content_excerpt),
        archive_path = sanitize_yaml_scalar(&archive_path),
        archive_hash = sanitize_yaml_scalar(&archive_hash),
        refined_truth = indent_yaml_block(&emission.refined_truth_yaml, 6),
        emitted_at = emission.emitted_at_epoch_ms,
        next_category = (emission.target_category + 1) % CATEGORY_RING_SIZE,
        findings = findings_block,
    )
}

#[cfg(feature = "micro-cell")]
fn indent_yaml_block(value: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    value
        .lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(feature = "micro-cell")]
fn sanitize_yaml_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " "))
}

#[cfg(feature = "micro-cell")]
fn now_epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(all(test, feature = "micro-cell"))]
mod tests {
    use super::{PulsarScheduler, PulsarStatus};
    use std::fs;
    use std::path::{Path, PathBuf};

    #[test]
    fn manual_tick_emits_yaml() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        let temp_dir = std::env::temp_dir().join(format!(
            "quantum-pulsar-manual-tick-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("temp dir");

        let research_path = temp_dir.join("category-00.md");
        fs::write(&research_path, "dummy content from queue fuel").expect("research file");
        write_queue_fixture(&temp_dir, &research_path);
        let manifest_path = temp_dir.join("vault_manifest.yaml");

        runtime.block_on(async {
            let local_scheduler = PulsarScheduler::new();
            let emission = local_scheduler.tick(&manifest_path).await.expect("pulsar tick");
            assert_eq!(emission.target_category, 0);
            assert_eq!(emission.status, PulsarStatus::RefinedTruth);
            assert!(emission.input_chunk.content_excerpt.contains("dummy content from queue fuel"));
            assert_eq!(emission.serialization_overhead_ms, 0.0);
            assert!(emission.purifier_fired);
            assert!(emission.archive_path.is_some());
        });

        let manifest = fs::read_to_string(&manifest_path).expect("manifest output");
        assert!(manifest.contains("status: REFINED_TRUTH"));
        assert!(manifest.contains("serialization_overhead_ms: 0.0"));
        assert!(manifest.contains("fuel_offset: 0"));
        assert!(manifest.contains("checksum_crc32:"));
        assert!(manifest.contains("archive_path:"));
        assert!(manifest.contains("clinical_text:"));
        assert!(manifest.contains("dummy content from queue fuel"));
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn missing_queue_emits_waiting_for_fuel() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        let temp_dir = std::env::temp_dir().join(format!(
            "quantum-pulsar-waiting-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).expect("temp dir");
        let manifest_path = temp_dir.join("vault_manifest.yaml");

        runtime.block_on(async {
            let local_scheduler = PulsarScheduler::new();
            let emission = local_scheduler.tick(&manifest_path).await.expect("waiting tick");
            assert_eq!(emission.status, PulsarStatus::WaitingForFuel);
        });

        let manifest = fs::read_to_string(&manifest_path).expect("manifest output");
        assert!(manifest.contains("status: WAITING_FOR_FUEL"));
        assert!(manifest.contains("missing pulsar_queue.json"));
        let _ = fs::remove_dir_all(&temp_dir);
    }

    fn write_queue_fixture(temp_dir: &PathBuf, research_path: &Path) {
        let categories = (0..96)
            .map(|category_id| {
                format!(
                    "{{\"category_id\":{category_id},\"research_file_path\":\"{}\",\"mime_hint\":\"text/markdown\"}}",
                    research_path.display().to_string().replace('\\', "\\\\")
                )
            })
            .collect::<Vec<_>>()
            .join(",");
        let queue_json = format!("{{\"categories\":[{categories}]}}");
        fs::write(temp_dir.join("pulsar_queue.json"), queue_json).expect("queue fixture");
    }
}













