#![allow(dead_code)]
use crate::models::*;
use crate::vault::*;
use async_trait::async_trait;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
#[cfg(not(target_arch = "wasm32"))]
use std::time::Duration;

pub const PRINTFUL_ORDER_SKU_PREFIX: &str = "MQ_PF_";
pub const GOOTEN_ORDER_SKU_PREFIX: &str = "MQ_GT_";
pub const APLIIQ_ORDER_SKU_PREFIX: &str = "MQ_AQ_";

#[async_trait(?Send)]
pub trait ProviderGateway: Sync {
    async fn authenticate(&self, key: &str) -> Result<(), QuantumError>;
    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError>;
    async fn push_forged_metadata(&self, pkt: &QuantumPacket) -> Result<PublishResponse, QuantumError>;
    async fn submit_order(&self, o: &QuantumFulfillmentOrder) -> Result<ProviderOrderResponse, QuantumError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Shop { pub id: String, pub name: String, pub sales_channel: Option<String> }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublishResponse { pub provider: FulfillmentProvider, pub store_id: String, pub product_id: String, pub upload_id: String, pub message: String, pub placement_position: String }

#[derive(Debug, Clone)]
pub struct PrintfulGateway { client: Client, vault: Arc<QuantumVault> }
impl PrintfulGateway { pub fn new(v: Arc<QuantumVault>) -> Result<Self, QuantumError> { Ok(Self { client: p_client()?, vault: v }) } }
#[async_trait(?Send)]
impl ProviderGateway for PrintfulGateway {
    async fn authenticate(&self, _: &str) -> Result<(), QuantumError> { Ok(()) }
    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> { Ok(vec![]) }
    async fn push_forged_metadata(&self, _: &QuantumPacket) -> Result<PublishResponse, QuantumError> { todo!() }
    async fn submit_order(&self, _: &QuantumFulfillmentOrder) -> Result<ProviderOrderResponse, QuantumError> { todo!() }
}

#[derive(Debug, Clone)]
pub struct GootenGateway { client: Client, vault: Arc<QuantumVault> }
impl GootenGateway { pub fn new(v: Arc<QuantumVault>) -> Result<Self, QuantumError> { Ok(Self { client: p_client()?, vault: v }) } }
#[async_trait(?Send)]
impl ProviderGateway for GootenGateway {
    async fn authenticate(&self, _: &str) -> Result<(), QuantumError> { Ok(()) }
    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> { Ok(vec![]) }
    async fn push_forged_metadata(&self, _: &QuantumPacket) -> Result<PublishResponse, QuantumError> { todo!() }
    async fn submit_order(&self, _: &QuantumFulfillmentOrder) -> Result<ProviderOrderResponse, QuantumError> { todo!() }
}

#[derive(Debug, Clone)]
pub struct ApliiqGateway { client: Client, vault: Arc<QuantumVault> }
impl ApliiqGateway { pub fn new(v: Arc<QuantumVault>) -> Result<Self, QuantumError> { Ok(Self { client: p_client()?, vault: v }) } }
#[async_trait(?Send)]
impl ProviderGateway for ApliiqGateway {
    async fn authenticate(&self, _: &str) -> Result<(), QuantumError> { Ok(()) }
    async fn fetch_shops(&self) -> Result<Vec<Shop>, QuantumError> { Ok(vec![]) }
    async fn push_forged_metadata(&self, _: &QuantumPacket) -> Result<PublishResponse, QuantumError> { todo!() }
    async fn submit_order(&self, _: &QuantumFulfillmentOrder) -> Result<ProviderOrderResponse, QuantumError> { todo!() }
}

fn p_client() -> Result<Client, QuantumError> {
    let b = Client::builder();
    #[cfg(not(target_arch = "wasm32"))]
    let b = b.timeout(Duration::from_secs(90));
    b.build().map_err(|e| QuantumError::Transport { service: "provider", message: e.to_string() })
}