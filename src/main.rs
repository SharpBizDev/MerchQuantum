#![allow(non_snake_case)]
mod models;
mod platforms;
mod providers;
mod router;
pub mod ui { pub mod app; pub mod carousel; }
mod vault;

#[cfg(any(all(feature = "desktop", not(target_arch = "wasm32")), all(feature = "web", target_arch = "wasm32")))]
use crate::providers::*;
use crate::router::OrderRouter;
#[cfg(any(all(feature = "desktop", not(target_arch = "wasm32")), all(feature = "web", target_arch = "wasm32")))]
use crate::ui::app::ContextQuantumApp;
use crate::vault::QuantumVault;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::desktop::{Config, WindowBuilder};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::LaunchBuilder;
use std::sync::{Arc, OnceLock};

pub struct AppRuntime {
    pub vault: Arc<QuantumVault>,
    pub router: Arc<OrderRouter>,
}

pub static APP_RUNTIME: OnceLock<AppRuntime> = OnceLock::new();

#[cfg(any(all(feature = "desktop", not(target_arch = "wasm32")), all(feature = "web", target_arch = "wasm32")))]
fn init_runtime() {
    APP_RUNTIME.get_or_init(|| {
        let vault = Arc::new(QuantumVault::new());
        let p = Arc::new(PrintfulGateway::new(Arc::clone(&vault)).unwrap());
        let g = Arc::new(GootenGateway::new(Arc::clone(&vault)).unwrap());
        let a = Arc::new(ApliiqGateway::new(Arc::clone(&vault)).unwrap());
        let router = Arc::new(OrderRouter::new(p, g, a));
        AppRuntime { vault, router }
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn main() {
    init_runtime();
    LaunchBuilder::desktop()
        .with_cfg(
            Config::new().with_window(
                WindowBuilder::new()
                    .with_title("ContextQuantum")
                    .with_transparent(true)
                    .with_decorations(false),
            ),
        )
        .launch(ContextQuantumApp);
}

#[cfg(all(feature = "web", target_arch = "wasm32"))]
fn main() {
    init_runtime();
    dioxus::launch(ContextQuantumApp);
}

#[cfg(not(any(all(feature = "desktop", not(target_arch = "wasm32")), all(feature = "web", target_arch = "wasm32"))))]
fn main() {
    panic!("Enable the desktop or web feature.");
}