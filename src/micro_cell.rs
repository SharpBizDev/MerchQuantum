#[cfg(feature = "micro-cell")]
use serde::{Deserialize, Serialize};
#[cfg(feature = "micro-cell")]
use std::sync::Arc;
#[cfg(feature = "micro-cell")]
use tokio::task::JoinHandle;
#[cfg(feature = "micro-cell")]
use wasmtime::{Config, Engine, Instance, Linker, Module, Store};

#[cfg(feature = "micro-cell")]
const DISKLESS_LIBRARIAN_WASM: &[u8] = b"\0asm\x01\0\0\0";

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibrarianIngressRecord {
    pub source_label: String,
    pub mime_hint: String,
    pub content_excerpt: String,
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
            }],
        }
    }
}

#[cfg(feature = "micro-cell")]
#[derive(Debug, Clone)]
pub struct LibrarianDataPlane {
    payload: LibrarianIngressPayload,
}

#[cfg(feature = "micro-cell")]
impl LibrarianDataPlane {
    pub fn new(payload: LibrarianIngressPayload) -> Self {
        Self { payload }
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
            "  records:".to_string(),
        ];

        for record in &self.payload.records {
            yaml.push(format!("    - source_label: {}", sanitize_yaml_scalar(&record.source_label)));
            yaml.push(format!("      mime_hint: {}", sanitize_yaml_scalar(&record.mime_hint)));
            yaml.push(format!("      content_excerpt: {}", sanitize_yaml_scalar(&record.content_excerpt)));
        }

        yaml.join("\n")
    }
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
        let engine = Engine::new(&config)?;
        Ok(Self {
            engine: Arc::new(engine),
        })
    }

    pub async fn instantiate(&self, wasm_bytes: Vec<u8>) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        self.instantiate_with_payload(wasm_bytes, LibrarianIngressPayload::default())
            .await
    }

    pub async fn instantiate_with_payload(
        &self,
        wasm_bytes: Vec<u8>,
        payload: LibrarianIngressPayload,
    ) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        let engine = Arc::clone(&self.engine);
        tokio::spawn(async move {
            let module = Module::from_binary(&engine, &wasm_bytes)?;
            let mut store = Store::new(&engine, payload.clone());
            let linker = Linker::new(&engine);
            let instance = linker.instantiate_async(&mut store, &module).await?;
            Ok(QuantumMicroCellHandle {
                store,
                instance,
                librarian_plane: LibrarianDataPlane::new(payload),
            })
        })
        .await
        .map_err(|join_err| wasmtime::Error::msg(join_err.to_string()))?
    }

    pub async fn instantiate_diskless_librarian(
        &self,
        payload: LibrarianIngressPayload,
    ) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        self.instantiate_with_payload(DISKLESS_LIBRARIAN_WASM.to_vec(), payload)
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
    pub store: Store<LibrarianIngressPayload>,
    pub instance: Instance,
    pub librarian_plane: LibrarianDataPlane,
}

#[cfg(feature = "micro-cell")]
fn sanitize_yaml_scalar(value: &str) -> String {
    format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', " "))
}

#[cfg(all(test, feature = "micro-cell"))]
mod tests {
    use super::{LibrarianIngressPayload, LibrarianIngressRecord, QuantumMicroCell};

    #[test]
    fn micro_cell_smoke_instantiates_diskless_runtime() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("tokio runtime");

        runtime.block_on(async {
            let cell = QuantumMicroCell::new().expect("micro-cell engine");
            let handle = cell
                .instantiate_diskless_librarian(LibrarianIngressPayload {
                    corpus_id: "test-corpus".to_string(),
                    embedding_model: "sbert-compact".to_string(),
                    authority: "Quantum Forge".to_string(),
                    records: vec![LibrarianIngressRecord {
                        source_label: "memory://record-1".to_string(),
                        mime_hint: "text/plain".to_string(),
                        content_excerpt: "Diskless daemonless librarian micro-cell boot.".to_string(),
                    }],
                })
                .await
                .expect("instantiate librarian micro-cell");

            assert!(handle.librarian_plane.yaml_manifest().contains("corpus_id: test-corpus"));
        });
    }
}
