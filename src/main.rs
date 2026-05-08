#![allow(non_snake_case)]
#[cfg(feature = "micro-cell")]
mod cold_vault;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
mod headless_router;
#[cfg(all(feature = "deploy", not(target_arch = "wasm32")))]
mod deploy;
mod governor;
mod ingestion;
mod iris;
mod ipc;
mod merch_engine;
mod metadata;
mod native_shell;
mod neural;
#[cfg(feature = "micro-cell")]
mod micro_cell;
#[cfg(feature = "micro-cell")]
mod pulsar;
mod models;
mod platforms;
mod providers;
mod router;
mod sensory;
mod sovereign;
mod stress_station;
mod synthesis;
pub mod ui {
    pub mod app;
    pub mod carousel;
    pub mod components {
        pub mod uwf_gauge;
    }
    pub mod spectral_bar;
    pub mod surface_projection;
    pub mod telemetry;
    pub mod uwf_telemetry;
}
mod vault;

#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
use crate::providers::*;
#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
use crate::ui::app::ContextQuantumApp;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::merch_engine::{MerchEngine, MerchListingRequest};
use crate::models::QuantumError;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::native_shell::desktop_config;
use crate::router::OrderRouter;
use crate::sensory::emitter::SpectralBridge;
use crate::sensory::governor::SensoryGovernor;
use crate::vault::QuantumVault;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::LaunchBuilder;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::fs::{self, OpenOptions};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::io::{Seek, SeekFrom, Write};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::process::Child;
use std::sync::{Arc, OnceLock};

const PILLAR_CORE_COUNT: usize = 2;

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
fn critical_fault(message: impl Into<String>) -> QuantumError {
    QuantumError::CriticalFault(message.into())
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn zero_forge_hotswap_projection() -> Result<(), QuantumError> {
    const HOTSWAP_BYTES: u64 = 134_217_728;
    const FORGE_CHUNK_BYTES: usize = 1_048_576;

    let hotswap_path = std::path::Path::new(r"V:\Egress\HotSwap.raw");
    if let Some(parent) = hotswap_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| QuantumError::IOFailure(format!("failed to create HotSwap directory: {error}")))?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .read(true)
        .write(true)
        .open(hotswap_path)
        .map_err(|error| QuantumError::IOFailure(format!("failed to open HotSwap.raw: {error}")))?;

    file.set_len(HOTSWAP_BYTES)
        .map_err(|error| QuantumError::IOFailure(format!("failed to size HotSwap.raw: {error}")))?;
    file.seek(SeekFrom::Start(0))
        .map_err(|error| QuantumError::IOFailure(format!("failed to rewind HotSwap.raw: {error}")))?;

    let zero_chunk = vec![0u8; FORGE_CHUNK_BYTES];
    let full_chunks = HOTSWAP_BYTES as usize / FORGE_CHUNK_BYTES;
    let remainder = HOTSWAP_BYTES as usize % FORGE_CHUNK_BYTES;

    for _ in 0..full_chunks {
        file.write_all(&zero_chunk)
            .map_err(|error| QuantumError::IOFailure(format!("failed to zero-forge HotSwap.raw: {error}")))?;
    }

    if remainder > 0 {
        file.write_all(&zero_chunk[..remainder])
            .map_err(|error| QuantumError::IOFailure(format!("failed to finalize HotSwap.raw zero-forge tail: {error}")))?;
    }

    file.sync_all()
        .map_err(|error| QuantumError::IOFailure(format!("failed to flush HotSwap.raw: {error}")))?;

    Ok(())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn spawn_swarm_worker_hosts(worker_threads: usize, core_count: usize) -> Result<Vec<Child>, QuantumError> {
    let current_exe = std::env::current_exe()
        .map_err(|error| critical_fault(format!("failed to resolve current executable: {error}")))?;
    let mut children = Vec::with_capacity(worker_threads.max(1));
    let swarm_span = core_count.saturating_sub(PILLAR_CORE_COUNT).max(1);

    for index in 0..worker_threads.max(1) {
        let core_index = PILLAR_CORE_COUNT + (index % swarm_span);
        let child = std::process::Command::new(&current_exe)
            .arg("--swarm-worker-host")
            .arg("--swarm-core-index")
            .arg(core_index.to_string())
            .spawn()
            .map_err(|error| critical_fault(format!("failed to spawn swarm worker host {index}: {error}")))?;

        crate::iris::register_swarm_process_pid(child.id())?;
        children.push(child);
    }

    Ok(children)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn run_swarm_worker_host() -> Result<(), QuantumError> {
    let core_index = std::env::args()
        .skip_while(|arg| arg != "--swarm-core-index")
        .nth(1)
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(PILLAR_CORE_COUNT);

    crate::iris::bind_current_thread_to_core(core_index)?;
    loop {
        std::thread::park();
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn maybe_run_native_merch_listing() -> Result<bool, QuantumError> {
    let mut args = std::env::args().skip(1);
    let mut source_path = None;
    let mut title_hint = None;
    let mut product_family = None;

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--forge-listing" => source_path = args.next(),
            "--forge-title" => title_hint = args.next(),
            "--forge-product-family" => product_family = args.next(),
            _ => {}
        }
    }

    let Some(path) = source_path else {
        return Ok(false);
    };

    let listing = MerchEngine::new().generate_listing(MerchListingRequest {
        file_name: std::path::Path::new(&path)
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("listing.png")
            .to_string(),
        image_bytes: fs::read(&path)
            .map_err(|error| QuantumError::IOFailure(format!("failed to read listing source {path}: {error}")))?,
        title_hint,
        product_family,
    })?;

    let rendered = serde_json::to_string_pretty(&listing)
        .map_err(|error| critical_fault(format!("failed to render native merch listing: {error}")))?;
    println!("{rendered}");
    Ok(true)
}

#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
fn build_runtime() -> Result<AppRuntime, QuantumError> {
    let vault = Arc::new(QuantumVault::new());
    let governor = Arc::new(SensoryGovernor::new());
    let sensory_bridge = Arc::new(SpectralBridge::new());
    let printful = Arc::new(PrintfulGateway::new(Arc::clone(&vault), Arc::clone(&governor))?);
    let gooten = Arc::new(GootenGateway::new(Arc::clone(&vault), Arc::clone(&governor))?);
    let apliiq = Arc::new(ApliiqGateway::new(Arc::clone(&vault), Arc::clone(&governor))?);
    let router = Arc::new(OrderRouter::new(printful, gooten, apliiq));

    Ok(AppRuntime {
        vault,
        router,
        governor,
        sensory_bridge,
    })
}

#[cfg(any(
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
))]
pub fn app_runtime() -> Result<&'static AppRuntime, QuantumError> {
    if let Some(runtime) = APP_RUNTIME.get() {
        return Ok(runtime);
    }

    let runtime = build_runtime()?;
    let _ = APP_RUNTIME.set(runtime);
    APP_RUNTIME
        .get()
        .ok_or_else(|| critical_fault("runtime unavailable after initialization"))
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
    if let Err(error) = desktop_entry() {
        eprintln!("quantum desktop bootstrap failed: {error}");
        std::process::exit(1);
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), not(feature = "deploy")))]
fn desktop_entry() -> Result<(), QuantumError> {
    if std::env::args().any(|arg| arg == "--swarm-worker-host") {
        return run_swarm_worker_host();
    }

    if maybe_run_native_merch_listing()? {
        return Ok(());
    }

    #[cfg(feature = "micro-cell")]
    if maybe_run_stress_station()? {
        return Ok(());
    }

    #[cfg(feature = "micro-cell")]
    zero_forge_hotswap_projection()?;

    let core_count = std::thread::available_parallelism()
        .map(|parallelism| parallelism.get())
        .unwrap_or(4)
        .max(3);
    let _ = crate::iris::ignite_live_iris(core_count)?;
    crate::iris::register_pillar_thread_current(0)?;

    #[cfg(feature = "micro-cell")]
    crate::ui::uwf_telemetry::start_uwf_monitor()?;

    crate::sovereign::start_sentinel()?;

    app_runtime()?;

    #[cfg(feature = "micro-cell")]
    if maybe_run_pulsar_tick()? {
        return Ok(());
    }
    #[cfg(feature = "micro-cell")]
    crate::pulsar::start_background(crate::pulsar::default_manifest_path());

    if std::env::args().any(|arg| arg == "--headless-forge") {
        return run_headless_forge();
    }

    if std::env::args().any(|arg| arg == "--headless") {
        return run_headless_core();
    }

    launch_desktop_ui();
    Ok(())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), not(feature = "deploy")))]
fn run_headless_core() -> Result<(), QuantumError> {
    crate::iris::register_pillar_thread_current(0)?;
    loop {
        std::thread::park();
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), not(feature = "deploy")))]
fn run_headless_forge() -> Result<(), QuantumError> {
    crate::iris::register_pillar_thread_current(1)?;
    let worker_threads = std::thread::available_parallelism()
        .map(|parallelism| parallelism.get())
        .unwrap_or(1);
    let core_count = std::thread::available_parallelism()
        .map(|parallelism| parallelism.get())
        .unwrap_or(4)
        .max(3);
    let swarm_hosts = spawn_swarm_worker_hosts(worker_threads, core_count)?;

    let runtime = tokio::runtime::Builder::new_multi_thread()
        .worker_threads(worker_threads)
        .thread_name("quantum-forge-worker")
        .on_thread_start(|| {
            let _ = crate::iris::register_swarm_thread_current("forge-runtime-worker");
        })
        .enable_all()
        .build()
        .map_err(|error| critical_fault(format!("failed to build headless forge runtime: {error}")))?;

    runtime.block_on(async move {
        let _swarm_hosts = swarm_hosts;
        let repo_root = std::env::current_dir()
            .map_err(|error| critical_fault(format!("failed to resolve repo root: {error}")))?;
        crate::neural::engine::ignition(repo_root.clone())?;
        crate::synthesis::evolution::start_seed_feedback_loop(repo_root);
        crate::headless_router::run_headless_router(worker_threads).await
    })
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), not(feature = "deploy")))]
fn launch_desktop_ui() {
    LaunchBuilder::desktop()
        .with_cfg(desktop_config())
        .launch(ContextQuantumApp);
}

#[cfg(all(feature = "web", target_arch = "wasm32", not(feature = "deploy")))]
fn main() {
    if let Err(error) = app_runtime() {
        web_sys::console::error_1(&wasm_bindgen::JsValue::from_str(&error.to_string()));
        return;
    }
    dioxus::launch(ContextQuantumApp);
}

#[cfg(not(any(
    all(feature = "deploy", not(target_arch = "wasm32")),
    all(feature = "desktop", not(target_arch = "wasm32")),
    all(feature = "web", target_arch = "wasm32")
)))]
fn main() {
    eprintln!("quantum bootstrap failed: enable the deploy, desktop, or web feature");
    std::process::exit(1);
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn maybe_run_stress_station() -> Result<bool, QuantumError> {
    if !std::env::args().any(|arg| arg == "--stress-station") {
        return Ok(false);
    }

    let repo_root = std::env::current_dir()
        .map_err(|error| critical_fault(format!("failed to resolve repo root: {error}")))?;
    let report = crate::stress_station::run_accelerated_stress_station(repo_root)?;
    let rendered = serde_json::to_string_pretty(&report)
        .map_err(|error| critical_fault(format!("failed to render stress report: {error}")))?;
    println!("{rendered}");
    Ok(true)
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn maybe_run_pulsar_tick() -> Result<bool, QuantumError> {
    if !std::env::args().any(|arg| arg == "--pulsar-tick") {
        return Ok(false);
    }

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| critical_fault(format!("failed to build pulsar runtime: {error}")))?;

    runtime.block_on(async {
        let emission = crate::pulsar::scheduler()
            .tick(crate::pulsar::default_manifest_path())
            .await
            .map_err(|error| critical_fault(format!("pulsar tick failed: {error}")))?;
        println!(
            "pulsar tick emitted {} category {:02} serialization_overhead_ms {:.1} archive {} purifier_fired {} excerpt {}",
            emission.status.as_str(),
            emission.target_category,
            emission.serialization_overhead_ms,
            emission
                .archive_path
                .clone()
                .unwrap_or_else(|| "none".to_string()),
            emission.purifier_fired,
            emission.input_chunk.content_excerpt
        );
        Ok(true)
    })
}
