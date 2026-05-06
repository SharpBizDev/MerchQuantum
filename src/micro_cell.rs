#[cfg(feature = "micro-cell")]
use std::sync::Arc;
#[cfg(feature = "micro-cell")]
use tokio::task::JoinHandle;
#[cfg(feature = "micro-cell")]
use wasmtime::{Engine, Instance, Linker, Module, Store};

#[cfg(feature = "micro-cell")]
pub struct QuantumMicroCell {
    engine: Arc<Engine>,
}

#[cfg(feature = "micro-cell")]
impl QuantumMicroCell {
    pub fn new() -> Self {
        Self {
            engine: Arc::new(Engine::default()),
        }
    }

    pub async fn instantiate(&self, wasm_bytes: Vec<u8>) -> Result<QuantumMicroCellHandle, wasmtime::Error> {
        let engine = Arc::clone(&self.engine);
        tokio::spawn(async move {
            let module = Module::from_binary(&engine, &wasm_bytes)?;
            let mut store = Store::new(&engine, ());
            let linker = Linker::new(&engine);
            let instance = linker.instantiate(&mut store, &module)?;
            Ok(QuantumMicroCellHandle { store, instance })
        })
        .await
        .map_err(|join_err| wasmtime::Error::msg(join_err.to_string()))?
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
    pub store: Store<()>,
    pub instance: Instance,
}
