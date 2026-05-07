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
mod metadata;
mod neural;
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
use std::process::Command;
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
fn critical_fault(message: impl Into<String>) -> QuantumError {
    QuantumError::CriticalFault(message.into())
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn zero_forge_hotswap_projection() -> Result<(), QuantumError> {
    let script = r#"
$path = 'V:\Egress\HotSwap.raw'
$directory = Split-Path -Parent $path
[System.IO.Directory]::CreateDirectory($directory) | Out-Null
$stream = [System.IO.File]::Open($path, [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::ReadWrite)
try {
    $stream.SetLength(134217728)
    $stream.Position = 0
    $chunk = New-Object byte[] 1048576
    for ($i = 0; $i -lt 128; $i++) {
        $stream.Write($chunk, 0, $chunk.Length)
    }
    $stream.Flush()
}
finally {
    $stream.Dispose()
}
"#;

    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", script])
        .status()
        .map_err(|error| critical_fault(format!("0xFF Zero-Forge command launch failed: {error}")))?;

    if status.success() {
        Ok(())
    } else {
        Err(critical_fault(format!(
            "0xFF Zero-Forge command failed with status {status}"
        )))
    }
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
