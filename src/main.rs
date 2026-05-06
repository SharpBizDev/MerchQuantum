#![allow(non_snake_case)]
#[cfg(all(feature = "deploy", not(target_arch = "wasm32")))]
mod deploy;
mod ingestion;
mod metadata;
#[cfg(feature = "micro-cell")]
mod micro_cell;
#[cfg(feature = "micro-cell")]
mod pulsar;
mod models;
mod native_shell;
mod platforms;
mod providers;
mod router;
mod sensory;
pub mod ui {
    pub mod app;
    pub mod carousel;
}
mod vault;

#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
use crate::providers::*;
use crate::router::OrderRouter;
use crate::sensory::emitter::SpectralBridge;
use crate::sensory::governor::SensoryGovernor;
#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
use crate::ui::app::ContextQuantumApp;
use crate::vault::QuantumVault;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::native_shell::desktop_config;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::LaunchBuilder;
use std::sync::{Arc, OnceLock};

pub struct AppRuntime {
    pub vault: Arc<QuantumVault>,
    pub router: Arc<OrderRouter>,
    pub governor: Arc<SensoryGovernor>,
    pub sensory_bridge: Arc<SpectralBridge>,
}

pub static APP_RUNTIME: OnceLock<AppRuntime> = OnceLock::new();

#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
fn init_runtime() {
    APP_RUNTIME.get_or_init(|| {
        let vault = Arc::new(QuantumVault::new());
        let governor = Arc::new(SensoryGovernor::new());
        let sensory_bridge = Arc::new(SpectralBridge::new());
        let p = Arc::new(PrintfulGateway::new(Arc::clone(&vault), Arc::clone(&governor)).unwrap());
        let g = Arc::new(GootenGateway::new(Arc::clone(&vault), Arc::clone(&governor)).unwrap());
        let a = Arc::new(ApliiqGateway::new(Arc::clone(&vault), Arc::clone(&governor)).unwrap());
        let router = Arc::new(OrderRouter::new(p, g, a));
        AppRuntime {
            vault,
            router,
            governor,
            sensory_bridge,
        }
    });
}

#[cfg(all(feature = "deploy", not(target_arch = "wasm32")))]
fn main() {
    if let Err(error) = crate::deploy::run() {
        eprintln!("quantum deploy failed: {error}");
        std::process::exit(1);
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), not(feature = "deploy")))]
fn main() {
    init_runtime();
    #[cfg(feature = "micro-cell")]
    match maybe_run_pulsar_tick() {
        Ok(true) => return,
        Ok(false) => {}
        Err(error) => {
            eprintln!("quantum pulsar tick failed: {error}");
            std::process::exit(1);
        }
    }
    #[cfg(feature = "micro-cell")]
    crate::pulsar::start_background(crate::pulsar::default_manifest_path());
    LaunchBuilder::desktop()
        .with_cfg(desktop_config())
        .launch(ContextQuantumApp);
}

#[cfg(all(feature = "web", target_arch = "wasm32", not(feature = "deploy")))]
fn main() {
    init_runtime();
    dioxus::launch(ContextQuantumApp);
}

#[cfg(not(any(
    all(feature = "deploy", not(target_arch = "wasm32")),
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
)))]
fn main() {
    panic!("Enable the deploy, desktop, or web feature.");
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn maybe_run_pulsar_tick() -> Result<bool, String> {
    if !std::env::args().any(|arg| arg == "--pulsar-tick") {
        return Ok(false);
    }

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;

    runtime.block_on(async {
        let emission = crate::pulsar::scheduler()
            .tick(crate::pulsar::default_manifest_path())
            .await?;
        println!(
            "pulsar tick emitted category {:02} at {}",
            emission.target_category, emission.emitted_at_epoch_ms
        );
        Ok(true)
    })
}
