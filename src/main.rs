mod models;
mod platforms;
mod providers;
mod router;
mod vault;

use crate::platforms::{AmazonGateway, EtsyGateway, MetaGateway, TiktokGateway, WalmartGateway};
use crate::providers::{ApliiqGateway, GootenGateway, PrintfulGateway};
use crate::router::OrderRouter;
use crate::vault::QuantumVault;
use std::sync::Arc;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let vault = Arc::new(QuantumVault::new());

    let printful = Arc::new(PrintfulGateway::new(Arc::clone(&vault))?);
    let gooten = Arc::new(GootenGateway::new(Arc::clone(&vault))?);
    let apliiq = Arc::new(ApliiqGateway::new(Arc::clone(&vault))?);

    let _etsy = Arc::new(EtsyGateway::new(Arc::clone(&vault))?);
    let _amazon = Arc::new(AmazonGateway::new(Arc::clone(&vault))?);
    let _walmart = Arc::new(WalmartGateway::new(Arc::clone(&vault))?);
    let _meta = Arc::new(MetaGateway::new(Arc::clone(&vault))?);
    let _tiktok = Arc::new(TiktokGateway::new(Arc::clone(&vault))?);

    let _router = Arc::new(OrderRouter::new(
        Arc::clone(&printful),
        Arc::clone(&gooten),
        Arc::clone(&apliiq),
    ));

    println!("Quantum Core Initialized");
    Ok(())
}
