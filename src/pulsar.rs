#[cfg(feature = "micro-cell")]
use crate::micro_cell::{LibrarianIngressPayload, LibrarianIngressRecord, QuantumMicroCell};
#[cfg(feature = "micro-cell")]
use serde::Deserialize;
#[cfg(feature = "micro-cell")]
use std::fs;
#[cfg(feature = "micro-cell")]
use std::path::{Path, PathBuf};
#[cfg(feature = "micro-cell")]
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
#[cfg(feature = "micro-cell")]
use std::sync::{Arc, OnceLock};
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

#[cfg(feature = "micro-cell")]
static PULSAR_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(feature = "micro-cell")]
static PULSAR_SCHEDULER: OnceLock<Arc<PulsarScheduler>> = OnceLock::new();

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
}

#[cfg(feature = "micro-cell")]
pub struct PulsarScheduler {
    pointer: AtomicU8,
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
}

#[cfg(feature = "micro-cell")]
enum FuelLoad {
    Ready {
        source_path: PathBuf,
        mime_hint: String,
        content: Vec<u8>,
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
        let queue_path = manifest_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("pulsar_queue.json");

        let emission = match load_fuel(target_category, &queue_path) {
            FuelLoad::Ready {
                source_path,
                mime_hint,
                content,
            } => {
                let input_chunk = build_input_chunk(
                    target_category,
                    mime_hint,
                    summarize_content(&content),
                    Some(source_path.display().to_string()),
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
                let handle = tokio::spawn(async move {
                    micro_cell
                        .instantiate_diskless_librarian(payload, content)
                        .await
                        .map_err(|error| error.to_string())
                });

                let micro_cell = handle
                    .await
                    .map_err(|join_error| join_error.to_string())??;

                PulsarEmission {
                    target_category,
                    status: PulsarStatus::RefinedTruth,
                    queue_path: queue_path.display().to_string(),
                    input_chunk,
                    refined_truth_yaml: micro_cell.librarian_plane.yaml_manifest(),
                    emitted_at_epoch_ms: now_epoch_ms(),
                    findings: vec![],
                    serialization_overhead_ms: micro_cell.serialization_overhead_ms,
                }
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
pub fn start_background(manifest_path: PathBuf) {
    if PULSAR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let scheduler = scheduler();
    thread::spawn(move || {
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
                let path = manifest_path.clone();
                let scheduler = scheduler.clone();
                tokio::spawn(async move {
                    let _ = scheduler.tick(path).await;
                });
            }
        });
    });
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
        source_path,
        mime_hint: entry
            .mime_hint
            .clone()
            .unwrap_or_else(|| infer_mime_hint(&entry.research_file_path)),
        content,
    }
}

#[cfg(feature = "micro-cell")]
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
) -> InputChunk {
    InputChunk {
        chunk_id: format!("chunk-{target_category:02}"),
        mime_hint,
        content_excerpt,
        zero_copy_block: format!("block://vault/category/{target_category:02}"),
        source_path,
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
        ),
        refined_truth_yaml: format!(
            "authority: Quantum Forge\nlibrarian_plane:\n  status: WAITING_FOR_FUEL\n  requested_category: category-{target_category:02}\n  note: {}\n  serialization_overhead_ms: 0.0",
            sanitize_yaml_scalar(&reason)
        ),
        emitted_at_epoch_ms: now_epoch_ms(),
        findings: vec![reason],
        serialization_overhead_ms: 0.0,
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

    format!(
        "authority: Quantum Forge\nruntime:\n  native_bridge: wry-ipc\n  state_owner: rust-single-writer\n  surface: ContextQuantum Refinery\nlibrarian:\n  role: Agent Librarian\n  exchange: vault-manifest-v1\n  embedding_model: sbert-compact\n  output_format: yaml\nbranches:\n  ui:\n    name: feature/quantum-refinery-core\n  native:\n    name: feature/quantum-sensory-core\nprotocol:\n  target_category: {category}\n  status: {status}\n  serialization_overhead_ms: {serialization_overhead_ms:.1}\n  forge_writes:\n    queue_file: {queue_path}\n    input_chunk:\n      chunk_id: {chunk_id}\n      mime_hint: {mime_hint}\n      zero_copy_block: {zero_copy_block}\n      source_path: {source_path}\n      content_excerpt: {excerpt}\n  micro_cell_reads:\n    designated_memory_block: {zero_copy_block}\n    zero_copy: true\n  micro_cell_emits:\n    refined_truth: |\n{refined_truth}\nlast_tick:\n  emitted_at_epoch_ms: {emitted_at}\n  category_pointer_after_tick: {next_category}\n{findings}\n",
        category = emission.target_category,
        status = emission.status.as_str(),
        serialization_overhead_ms = emission.serialization_overhead_ms,
        queue_path = sanitize_yaml_scalar(&emission.queue_path),
        chunk_id = sanitize_yaml_scalar(&emission.input_chunk.chunk_id),
        mime_hint = sanitize_yaml_scalar(&emission.input_chunk.mime_hint),
        zero_copy_block = sanitize_yaml_scalar(&emission.input_chunk.zero_copy_block),
        source_path = sanitize_yaml_scalar(&source_path),
        excerpt = sanitize_yaml_scalar(&emission.input_chunk.content_excerpt),
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
        });

        let manifest = fs::read_to_string(&manifest_path).expect("manifest output");
        assert!(manifest.contains("status: REFINED_TRUTH"));
        assert!(manifest.contains("serialization_overhead_ms: 0.0"));
        assert!(manifest.contains("fuel_offset: 0"));
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
