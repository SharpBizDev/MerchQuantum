#![allow(non_snake_case)]

mod models;
mod platforms;
mod providers;
mod router;
mod ui {
    pub mod app;
    pub mod carousel;
}
mod vault;

use crate::platforms::{AmazonGateway, EtsyGateway, MetaGateway, TiktokGateway, WalmartGateway};
use crate::providers::{ApliiqGateway, GootenGateway, PrintfulGateway};
use crate::router::OrderRouter;
use crate::ui::app::ContextQuantumApp;
use crate::vault::QuantumVault;
use dioxus::launch;
use std::sync::{Arc, OnceLock};

pub struct AppRuntime {
    pub vault: Arc<QuantumVault>,
    pub router: Arc<OrderRouter>,
}

pub static APP_RUNTIME: OnceLock<AppRuntime> = OnceLock::new();

fn main() {
    let vault = Arc::new(QuantumVault::new());

    let printful = Arc::new(
        PrintfulGateway::new(Arc::clone(&vault))
            .expect("failed to initialize Printful gateway"),
    );
    let gooten = Arc::new(
        GootenGateway::new(Arc::clone(&vault)).expect("failed to initialize Gooten gateway"),
    );
    let apliiq = Arc::new(
        ApliiqGateway::new(Arc::clone(&vault)).expect("failed to initialize Apliiq gateway"),
    );

    let _etsy =
        Arc::new(EtsyGateway::new(Arc::clone(&vault)).expect("failed to initialize Etsy gateway"));
    let _amazon = Arc::new(
        AmazonGateway::new(Arc::clone(&vault)).expect("failed to initialize Amazon gateway"),
    );
    let _walmart = Arc::new(
        WalmartGateway::new(Arc::clone(&vault)).expect("failed to initialize Walmart gateway"),
    );
    let _meta =
        Arc::new(MetaGateway::new(Arc::clone(&vault)).expect("failed to initialize Meta gateway"));
    let _tiktok = Arc::new(
        TiktokGateway::new(Arc::clone(&vault)).expect("failed to initialize TikTok gateway"),
    );

    let router = Arc::new(OrderRouter::new(
        Arc::clone(&printful),
        Arc::clone(&gooten),
        Arc::clone(&apliiq),
    ));

    if APP_RUNTIME
        .set(AppRuntime {
            vault: Arc::clone(&vault),
            router: Arc::clone(&router),
        })
        .is_err()
    {
        panic!("ContextQuantum runtime should only be initialized once");
    }

    launch(ContextQuantumApp);
}




