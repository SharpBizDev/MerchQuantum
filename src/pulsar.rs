#[cfg(feature = "micro-cell")]
use crate::micro_cell::{LibrarianIngressPayload, LibrarianIngressRecord, QuantumMicroCell};
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
const CATEGORY_RING_SIZE: u8 = 96;
#[cfg(feature = "micro-cell")]
const PULSAR_CADENCE: Duration = Duration::from_millis(37_500);

#[cfg(feature = "micro-cell")]
static PULSAR_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(feature = "micro-cell")]
static PULSAR_SCHEDULER: OnceLock<Arc<PulsarScheduler>> = OnceLock::new();

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct InputChunk {
    pub chunk_id: String,
    pub mime_hint: String,
    pub content_excerpt: String,
    pub zero_copy_block: String,
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct PulsarEmission {
    pub target_category: u8,
    pub input_chunk: InputChunk,
    pub refined_truth_yaml: String,
    pub emitted_at_epoch_ms: u128,
}

#[cfg(feature = "micro-cell")]
pub struct PulsarScheduler {
    pointer: AtomicU8,
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
        let input_chunk = build_input_chunk(target_category);
        let payload = LibrarianIngressPayload {
            corpus_id: format!("category-{target_category:02}"),
            embedding_model: "sbert-compact".to_string(),
            authority: "Quantum Forge".to_string(),
            records: vec![LibrarianIngressRecord {
                source_label: input_chunk.zero_copy_block.clone(),
                mime_hint: input_chunk.mime_hint.clone(),
                content_excerpt: input_chunk.content_excerpt.clone(),
            }],
        };

        let micro_cell = QuantumMicroCell::new().map_err(|error| error.to_string())?;
        let handle = tokio::spawn(async move {
            micro_cell
                .instantiate_diskless_librarian(payload)
                .await
                .map_err(|error| error.to_string())
        });

        let micro_cell = handle
            .await
            .map_err(|join_error| join_error.to_string())??;

        let emission = PulsarEmission {
            target_category,
            input_chunk,
            refined_truth_yaml: micro_cell.librarian_plane.yaml_manifest(),
            emitted_at_epoch_ms: now_epoch_ms(),
        };

        write_manifest(manifest_path.as_ref(), &emission)?;
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
fn build_input_chunk(target_category: u8) -> InputChunk {
    InputChunk {
        chunk_id: format!("chunk-{target_category:02}"),
        mime_hint: "text/markdown".to_string(),
        content_excerpt: format!(
            "Target category {target_category:02} is queued for librarian refinement through the pulsar lane."
        ),
        zero_copy_block: format!("block://vault/category/{target_category:02}"),
    }
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
    format!(
        "authority: Quantum Forge\nruntime:\n  native_bridge: wry-ipc\n  state_owner: rust-single-writer\n  surface: ContextQuantum Refinery\nlibrarian:\n  role: Agent Librarian\n  exchange: vault-manifest-v1\n  embedding_model: sbert-compact\n  output_format: yaml\nbranches:\n  ui:\n    name: feature/quantum-refinery-core\n  native:\n    name: feature/quantum-sensory-core\nprotocol:\n  target_category: {category}\n  forge_writes:\n    input_chunk:\n      chunk_id: {chunk_id}\n      mime_hint: {mime_hint}\n      zero_copy_block: {zero_copy_block}\n      content_excerpt: {excerpt}\n  micro_cell_reads:\n    designated_memory_block: {zero_copy_block}\n    zero_copy: true\n  micro_cell_emits:\n    refined_truth: |\n{refined_truth}\nlast_tick:\n  emitted_at_epoch_ms: {emitted_at}\n  category_pointer_after_tick: {next_category}\nfindings: []\n",
        category = emission.target_category,
        chunk_id = sanitize_yaml_scalar(&emission.input_chunk.chunk_id),
        mime_hint = sanitize_yaml_scalar(&emission.input_chunk.mime_hint),
        zero_copy_block = sanitize_yaml_scalar(&emission.input_chunk.zero_copy_block),
        excerpt = sanitize_yaml_scalar(&emission.input_chunk.content_excerpt),
        refined_truth = indent_yaml_block(&emission.refined_truth_yaml, 6),
        emitted_at = emission.emitted_at_epoch_ms,
        next_category = (emission.target_category + 1) % CATEGORY_RING_SIZE,
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
    use super::{scheduler, PulsarScheduler};
    use std::fs;

    #[test]
    fn manual_tick_emits_yaml() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        let temp_path = std::env::temp_dir().join("quantum-pulsar-manual-tick.yaml");
        if temp_path.exists() {
            let _ = fs::remove_file(&temp_path);
        }

        runtime.block_on(async {
            let local_scheduler = PulsarScheduler::new();
            let emission = local_scheduler.tick(&temp_path).await.expect("pulsar tick");
            assert_eq!(emission.target_category, 0);
        });

        let manifest = fs::read_to_string(&temp_path).expect("manifest output");
        assert!(manifest.contains("target_category: 0"));
        assert!(manifest.contains("refined_truth:"));
        let _ = fs::remove_file(&temp_path);

        let shared = scheduler();
        assert!(shared.current_category() < 96);
    }
}


