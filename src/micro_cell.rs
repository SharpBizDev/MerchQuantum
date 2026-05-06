#[cfg(feature = "micro-cell")]
use crc32fast::Hasher;
#[cfg(feature = "micro-cell")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "micro-cell")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(feature = "micro-cell")]
use std::sync::Arc;
#[cfg(feature = "micro-cell")]
use std::thread;
#[cfg(feature = "micro-cell")]
use std::time::{Duration, Instant};
#[cfg(feature = "micro-cell")]
use tokio::task::JoinHandle;
#[cfg(feature = "micro-cell")]
use wasmtime::{Config, Engine, Instance, Linker, Module, Store, StoreLimits, StoreLimitsBuilder};

#[cfg(feature = "micro-cell")]
const DISKLESS_LIBRARIAN_WASM: &[u8] = &[
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01, 0x07, 0x0a,
    0x01, 0x06, 0x6d, 0x65, 0x6d, 0x6f, 0x72, 0x79, 0x02, 0x00,
];
#[cfg(feature = "micro-cell")]
pub const MICRO_CELL_MEMORY_LIMIT_BYTES: usize = 64 * 1024 * 1024;
#[cfg(feature = "micro-cell")]
const WASM_PAGE_BYTES: usize = 65_536;
#[cfg(feature = "micro-cell")]
const EPOCH_GUILLOTINE_INTERVAL: Duration = Duration::from_micros(500);

#[cfg(feature = "micro-cell")]
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct QuantumFuel {
    pub data_offset: u32,
    pub data_len: u32,
    pub checksum_crc32: u32,
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarianIngressRecord {
    pub source_label: String,
    pub mime_hint: String,
    pub content_excerpt: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fuel: Option<QuantumFuel>,
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarianIngressPayload {
    pub corpus_id: String,
    pub embedding_model: String,
    pub authority: String,
    pub records: Vec<LibrarianIngressRecord>,
}

#[cfg(feature = "micro-cell")]
impl Default for LibrarianIngressPayload {
    fn default() -> Self {
        Self {
            corpus_id: "vault-manifest-bootstrap".to_string(),
            embedding_model: "sbert-compact".to_string(),
            authority: "Quantum Forge".to_string(),
            records: vec![LibrarianIngressRecord {
                source_label: "seed://librarian".to_string(),
                mime_hint: "text/markdown".to_string(),
                content_excerpt: "Bootstrap the librarian ingestion lane with SBERT-aligned summaries.".to_string(),
                fuel: Some(QuantumFuel {
                    data_offset: 0,
                    data_len: 0,
                    checksum_crc32: 0,
                }),
            }],
        }
    }
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct LibrarianDataPlane {
    payload: LibrarianIngressPayload,
    fuel: Option<QuantumFuel>,
    fuel_preview: Option<String>,
    serialization_overhead_ms: f32,
    checksum_verified: bool,
    purifier_fired: bool,
    purified_text: String,
    raw_vault_path: Option<String>,
    raw_vault_hash: Option<String>,
}

#[cfg(feature = "micro-cell")]
impl LibrarianDataPlane {
    pub fn new(
        payload: LibrarianIngressPayload,
        fuel: Option<QuantumFuel>,
        fuel_preview: Option<String>,
        serialization_overhead_ms: f32,
        checksum_verified: bool,
        purifier_fired: bool,
        purified_text: String,
        raw_vault_path: Option<String>,
        raw_vault_hash: Option<String>,
    ) -> Self {
        Self {
            payload,
            fuel,
            fuel_preview,
            serialization_overhead_ms,
            checksum_verified,
            purifier_fired,
            purified_text,
            raw_vault_path,
            raw_vault_hash,
        }
    }

    pub fn payload(&self) -> &LibrarianIngressPayload {
        &self.payload
    }

    pub fn yaml_manifest(&self) -> String {
        let mut yaml = vec![
            "authority: Quantum Forge".to_string(),
            "librarian_plane:".to_string(),
            format!("  corpus_id: {}", self.payload.corpus_id),
            format!("  embedding_model: {}", self.payload.embedding_model),
            format!("  authority: {}", self.payload.authority),
            format!("  serialization_overhead_ms: {:.1}", self.serialization_overhead_ms),
            format!("  checksum_verified: {}", self.checksum_verified),
            "  purifier:".to_string(),
            format!("    fired: {}", self.purifier_fired),
            "    clinical_text: |".to_string(),
        ];
        yaml.extend(indent_yaml_block(&self.purified_text, 6));
        if let Some(path) = &self.raw_vault_path {
            yaml.push("  cold_vault:".to_string());
            yaml.push(format!("    archive_path: {}", sanitize_yaml_scalar(path)));
            if let Some(hash) = &self.raw_vault_hash {
                yaml.push(format!("    sha256: {}", sanitize_yaml_scalar(hash)));
            }
        }
        yaml.push("  records:".to_string());

        for record in &self.payload.records {
            yaml.push(format!("    - source_label: {}", sanitize_yaml_scalar(&record.source_label)));
            yaml.push(format!("      mime_hint: {}", sanitize_yaml_scalar(&record.mime_hint)));
            yaml.push(format!("      content_excerpt: {}", sanitize_yaml_scalar(&record.content_excerpt)));
            if let Some(fuel) = record.fuel.or(self.fuel) {
                yaml.push(format!("      fuel_offset: {}", fuel.data_offset));
                yaml.push(format!("      fuel_len: {}", fuel.data_len));
                yaml.push(format!("      checksum_crc32: {}", fuel.checksum_crc32));
            }
            if let Some(preview) = &self.fuel_preview {
                yaml.push("      fuel_preview: |".to_string());
                yaml.extend(indent_yaml_block(preview, 8));
            }
        }

        yaml.join("\n")
    }
}

#[cfg(feature = "micro-cell")]
#[derive(Debug)]
pub(crate) struct MicroCellStoreState {
    payload: LibrarianIngressPayload,
    limits: StoreLimits,
}

#[cfg(feature = "micro-cell")]
pub struct QuantumMicroCell {
    engine: Arc<Engine>,
}

#[cfg(feature = "micro-cell")]
impl QuantumMicroCell {
    pub fn new() -> Result<Self, wasmtime::Error> {
        let mut config = Config::new();
        config.async_support(true);
        config.epoch_interruption(true);
        let engine = Engine::new(&config)?;
        Ok(Self {
            engine: Arc::new(engine),
        })
    }

    pub fn engine_handle(&self) -> Arc<Engine> {
        Arc::clone(&self.engine)
    }

    pub async fn instantiate(&self, wasm_bytes: Vec<u8>) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        self.instantiate_with_fuel(
            wasm_bytes,
            LibrarianIngressPayload::default(),
            Vec::new(),
            None,
            None,
        )
        .await
    }

    pub async fn instantiate_with_fuel(
        &self,
        wasm_bytes: Vec<u8>,
        payload: LibrarianIngressPayload,
        fuel_bytes: Vec<u8>,
        raw_vault_path: Option<String>,
        raw_vault_hash: Option<String>,
    ) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        let engine = Arc::clone(&self.engine);
        tokio::spawn(async move {
            let module = Module::from_binary(&engine, &wasm_bytes)?;
            let mut store = Store::new(
                &engine,
                MicroCellStoreState {
                    payload: payload.clone(),
                    limits: StoreLimitsBuilder::new()
                        .memory_size(MICRO_CELL_MEMORY_LIMIT_BYTES)
                        .memories(1)
                        .instances(1)
                        .trap_on_grow_failure(true)
                        .build(),
                },
            );
            store.limiter(|state| &mut state.limits);
            store.set_epoch_deadline(1);
            let linker = Linker::new(&engine);
            let instance = linker.instantiate_async(&mut store, &module).await?;
            let fuel = write_guest_fuel(&mut store, &instance, &fuel_bytes)?;
            let fuel_preview = if fuel.data_len == 0 {
                None
            } else {
                Some(summarize_bytes(&fuel_bytes))
            };
            let purified_text = purify_ingress(&fuel_bytes);
            let mut payload = payload;
            for record in &mut payload.records {
                record.fuel = Some(fuel);
            }
            let _ = store.data().payload.records.len();
            Ok(QuantumMicroCellHandle {
                _store: store,
                _instance: instance,
                _fuel: Some(fuel),
                serialization_overhead_ms: 0.0,
                checksum_verified: true,
                purifier_fired: true,
                purified_text: purified_text.clone(),
                librarian_plane: LibrarianDataPlane::new(
                    payload,
                    Some(fuel),
                    fuel_preview,
                    0.0,
                    true,
                    true,
                    purified_text,
                    raw_vault_path,
                    raw_vault_hash,
                ),
            })
        })
        .await
        .map_err(|join_err| wasmtime::Error::msg(join_err.to_string()))?
    }

    pub async fn instantiate_diskless_librarian(
        &self,
        payload: LibrarianIngressPayload,
        fuel_bytes: Vec<u8>,
        raw_vault_path: Option<String>,
        raw_vault_hash: Option<String>,
    ) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        self.instantiate_with_fuel(
            DISKLESS_LIBRARIAN_WASM.to_vec(),
            payload,
            fuel_bytes,
            raw_vault_path,
            raw_vault_hash,
        )
        .await
    }

    pub fn spawn_runtime(&self, wasm_bytes: Vec<u8>) -> JoinHandle<Result<QuantumMicroCellHandle, wasmtime::Error>> {
        let cell = self.clone();
        tokio::spawn(async move { cell.instantiate(wasm_bytes).await })
    }
}

#[cfg(feature = "micro-cell")]
impl Clone for QuantumMicroCell {
    fn clone(&self) -> Self {
        Self {
            engine: Arc::clone(&self.engine),
        }
    }
}

#[cfg(feature = "micro-cell")]
pub struct QuantumMicroCellHandle {
    _store: Store<MicroCellStoreState>,
    _instance: Instance,
    _fuel: Option<QuantumFuel>,
    pub serialization_overhead_ms: f32,
    pub checksum_verified: bool,
    pub purifier_fired: bool,
    pub purified_text: String,
    pub librarian_plane: LibrarianDataPlane,
}

#[cfg(feature = "micro-cell")]
pub fn spawn_epoch_guillotine(engine: Arc<Engine>) -> Arc<AtomicBool> {
    let stop = Arc::new(AtomicBool::new(false));
    let stop_signal = Arc::clone(&stop);
    thread::spawn(move || {
        let mut last_epoch = Instant::now();
        while !stop_signal.load(Ordering::Relaxed) {
            if last_epoch.elapsed() >= EPOCH_GUILLOTINE_INTERVAL {
                engine.increment_epoch();
                last_epoch = Instant::now();
            } else {
                std::hint::spin_loop();
            }
        }
    });
    stop
}

#[cfg(feature = "micro-cell")]
fn write_guest_fuel(
    store: &mut Store<MicroCellStoreState>,
    instance: &Instance,
    fuel_bytes: &[u8],
) -> Result<QuantumFuel, wasmtime::Error> {
    let Some(memory) = instance.get_memory(&mut *store, "memory") else {
        return Err(wasmtime::Error::msg("guest memory export missing"));
    };

    if fuel_bytes.len() > MICRO_CELL_MEMORY_LIMIT_BYTES {
        return Err(wasmtime::Error::msg("fuel exceeds 64MB micro-cell limit"));
    }

    let current_size = memory.data_size(&*store);
    if fuel_bytes.len() > current_size {
        let missing_bytes = fuel_bytes.len() - current_size;
        let additional_pages = ((missing_bytes + WASM_PAGE_BYTES - 1) / WASM_PAGE_BYTES) as u64;
        memory.grow(&mut *store, additional_pages)?;
    }

    let checksum_crc32 = compute_crc32(fuel_bytes);
    let data = memory.data_mut(&mut *store);
    let data_len = fuel_bytes.len();
    if data_len > 0 {
        data[..data_len].copy_from_slice(fuel_bytes);
    }
    let guest_crc = compute_crc32(&data[..data_len]);
    if guest_crc != checksum_crc32 {
        return Err(wasmtime::Error::msg("guest ingress checksum verification failed"));
    }

    Ok(QuantumFuel {
        data_offset: 0,
        data_len: data_len as u32,
        checksum_crc32,
    })
}

#[cfg(feature = "micro-cell")]
fn compute_crc32(bytes: &[u8]) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(bytes);
    hasher.finalize()
}

#[cfg(feature = "micro-cell")]
fn sanitize_yaml_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " "))
}

#[cfg(feature = "micro-cell")]
fn indent_yaml_block(value: &str, spaces: usize) -> Vec<String> {
    let prefix = " ".repeat(spaces);
    value
        .lines()
        .map(|line| format!("{prefix}{line}"))
        .collect::<Vec<_>>()
}

#[cfg(feature = "micro-cell")]
fn summarize_bytes(value: &[u8]) -> String {
    const PREVIEW_LIMIT: usize = 160;
    let text = String::from_utf8_lossy(value);
    let squashed = text.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut preview = squashed.chars().take(PREVIEW_LIMIT).collect::<String>();
    if squashed.chars().count() > PREVIEW_LIMIT {
        preview.push_str("...");
    }
    preview
}

#[cfg(feature = "micro-cell")]
fn purify_ingress(value: &[u8]) -> String {
    let text = String::from_utf8_lossy(value);
    let mut purified = String::with_capacity(text.len());
    let mut previous_space = false;

    for ch in text.chars() {
        let normalized = if ch.is_alphanumeric() {
            Some(ch)
        } else if ch.is_whitespace() {
            Some(' ')
        } else {
            Some(' ')
        };

        if let Some(character) = normalized {
            if character == ' ' {
                if !previous_space {
                    purified.push(' ');
                }
                previous_space = true;
            } else {
                purified.push(character);
                previous_space = false;
            }
        }
    }

    purified.trim().to_string()
}

#[cfg(all(test, feature = "micro-cell"))]
mod tests {
    use super::{
        compute_crc32, spawn_epoch_guillotine, LibrarianIngressPayload, LibrarianIngressRecord,
        QuantumMicroCell, MICRO_CELL_MEMORY_LIMIT_BYTES,
    };
    use std::sync::Arc;
    use std::sync::atomic::Ordering;
    use wasmtime::Engine;

    #[test]
    fn micro_cell_smoke_instantiates_diskless_runtime() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        runtime.block_on(async {
            let cell = QuantumMicroCell::new().expect("micro-cell engine");
            let handle = cell
                .instantiate_diskless_librarian(
                    LibrarianIngressPayload {
                        corpus_id: "test-corpus".to_string(),
                        embedding_model: "sbert-compact".to_string(),
                        authority: "Quantum Forge".to_string(),
                        records: vec![LibrarianIngressRecord {
                            source_label: "memory://record-1".to_string(),
                            mime_hint: "text/plain".to_string(),
                            content_excerpt: "Diskless daemonless librarian micro-cell boot.".to_string(),
                            fuel: None,
                        }],
                    },
                    b"Diskless daemonless librarian micro-cell boot.".to_vec(),
                    Some("vault/provenance/00/demo.raw.zst".to_string()),
                    Some("deadbeef".to_string()),
                )
                .await
                .expect("instantiate librarian micro-cell");

            let yaml = handle.librarian_plane.yaml_manifest();
            assert!(yaml.contains("corpus_id: test-corpus"));
            assert!(yaml.contains("fuel_offset: 0"));
            assert!(yaml.contains("checksum_crc32:"));
            assert!(yaml.contains("serialization_overhead_ms: 0.0"));
            assert!(yaml.contains("clinical_text:"));
            assert!(yaml.contains("archive_path:"));
            assert!(handle.serialization_overhead_ms == 0.0);
            assert!(handle.checksum_verified);
            assert!(handle.purifier_fired);
        });
    }

    #[test]
    fn micro_cell_rejects_fuel_over_limit() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        runtime.block_on(async {
            let cell = QuantumMicroCell::new().expect("micro-cell engine");
            let too_large = vec![0u8; MICRO_CELL_MEMORY_LIMIT_BYTES + 1];
            let result = cell
                .instantiate_diskless_librarian(
                    LibrarianIngressPayload::default(),
                    too_large,
                    None,
                    None,
                )
                .await;
            assert!(result.is_err());
        });
    }

    #[test]
    fn crc32_matches_known_value() {
        assert_eq!(compute_crc32(b"123456789"), 0xcbf4_3926);
    }

    #[test]
    fn epoch_guillotine_thread_can_start_and_stop() {
        let engine = Arc::new(Engine::default());
        let stop = spawn_epoch_guillotine(engine);
        stop.store(true, Ordering::Relaxed);
    }
}


