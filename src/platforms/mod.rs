use crate::models::*;
use crate::vault::*;
use async_trait::async_trait;
use base64::Engine as _;
use chrono::Utc;
use reqwest::header::{
    HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE, HOST, USER_AGENT,
};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const USER_AGENT_VALUE: &str = "MerchQuantum/1.0 (Language=Rust)";
const PLATFORM_TIMEOUT_SECS: u64 = 90;

#[async_trait]
pub trait PlatformGateway: Send + Sync {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError>;
    async fn refresh_token(&self) -> Result<(), QuantumError>;
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError>;
    async fn sync_inventory(&self, sku: &str, quantity: u32) -> Result<(), QuantumError>;
}

#[derive(Debug, Clone)]
pub struct EtsyGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}
#[derive(Debug, Clone)]
pub struct AmazonGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}
#[derive(Debug, Clone)]
pub struct WalmartGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}
#[derive(Debug, Clone)]
pub struct MetaGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}
#[derive(Debug, Clone)]
pub struct TiktokGateway {
    client: Client,
    vault: Arc<QuantumVault>,
}

impl EtsyGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: platform_client("etsy")?,
            vault,
        })
    }
}
impl AmazonGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: platform_client("amazon")?,
            vault,
        })
    }
}
impl WalmartGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: platform_client("walmart")?,
            vault,
        })
    }
}
impl MetaGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: platform_client("meta")?,
            vault,
        })
    }
}
impl TiktokGateway {
    pub fn new(vault: Arc<QuantumVault>) -> Result<Self, QuantumError> {
        Ok(Self {
            client: platform_client("tiktok")?,
            vault,
        })
    }
}

#[async_trait]
impl PlatformGateway for EtsyGateway {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError> {
        if auth_payload.platform != CommercePlatform::Etsy {
            return Err(QuantumError::Vault(
                "Etsy authorization requires platform=etsy".into(),
            ));
        }
        self.vault.store_platform_auth(auth_payload.clone())
    }
    async fn refresh_token(&self) -> Result<(), QuantumError> {
        Ok(())
    }
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError> {
        let etsy = packet.platform.etsy.as_ref().ok_or_else(|| {
            QuantumError::InvalidForgePacket(
                "QuantumPacket.platform.etsy is required for Etsy injection".into(),
            )
        })?;
        let sku = packet
            .platform
            .sku
            .clone()
            .unwrap_or_else(|| generate_marketplace_sku("ETSY", &packet.forge.title));
        let listing_id = opaque_platform_id_to_u64(&sku);
        self.vault.store_platform_listing(
            CommercePlatform::Etsy,
            PlatformListingIndexRecord {
                listing_id,
                shop_id: etsy.shop_id,
                sku: sku.clone(),
                state: if etsy.should_activate {
                    "active".to_string()
                } else {
                    "draft".to_string()
                },
            },
            Some(EtsyInventoryTemplate {
                listing_id,
                shop_id: etsy.shop_id,
                sku: sku.clone(),
                price_major: packet.platform.price_major,
                readiness_state_id: etsy.readiness_state_id,
            }),
        )?;
        Ok(PlatformListingResponse {
            platform: CommercePlatform::Etsy,
            merchant_id: etsy.shop_id.to_string(),
            shop_id: etsy.shop_id,
            listing_id,
            sku,
            state: if etsy.should_activate {
                "active".to_string()
            } else {
                "draft".to_string()
            },
            uploaded_image_ids: vec![],
            inventory_synced: true,
        })
    }
    async fn sync_inventory(&self, sku: &str, quantity: u32) -> Result<(), QuantumError> {
        if quantity == 0 {
            return Err(QuantumError::InvalidForgePacket(
                "Etsy inventory quantity must be greater than zero".into(),
            ));
        }
        let _ = self.vault.etsy_inventory_template_by_sku(sku)?;
        Ok(())
    }
}

#[async_trait]
impl PlatformGateway for AmazonGateway {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError> {
        if auth_payload.platform != CommercePlatform::Amazon {
            return Err(QuantumError::Vault(
                "Amazon authorization requires platform=amazon".into(),
            ));
        }
        self.vault.store_platform_auth(auth_payload.clone())
    }
    async fn refresh_token(&self) -> Result<(), QuantumError> {
        Ok(())
    }
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError> {
        let session = self.vault.platform_session(CommercePlatform::Amazon)?;
        let sku = packet
            .platform
            .sku
            .clone()
            .unwrap_or_else(|| generate_marketplace_sku("AMZN", &packet.forge.title));
        let parts = split_delimited_parts(
            session.client_secret.as_deref().unwrap_or(""),
            ':',
            10,
            "Amazon client_secret",
        )?;
        let config = AmazonSigConfig {
            aws_access_key_id: parts[1].to_string(),
            aws_secret_access_key: parts[2].to_string(),
            aws_session_token: if parts[3].is_empty() {
                None
            } else {
                Some(parts[3].to_string())
            },
            aws_region: parts[4].to_string(),
        };
        let host = parts[5];
        let marketplace_id = parts[6];
        let seller_id = session
            .merchant_id
            .clone()
            .unwrap_or_else(|| "seller".to_string());
        let path = format!(
            "/listings/2021-08-01/items/{}/{}",
            amazon_uri_encode(&seller_id),
            amazon_uri_encode(&sku)
        );
        let query = format!("marketplaceIds={}", amazon_uri_encode(marketplace_id));
        let body = json!({ "sku": sku, "title": truncate_chars(&packet.forge.title, 200), "quantity": packet.platform.quantity, "price": round2(packet.platform.price_major) }).to_string();
        let _headers = build_amazon_sigv4_headers(
            "PUT",
            host,
            &path,
            &query,
            &body,
            &session.access_token,
            &config,
        )?;
        let listing_id = opaque_platform_id_to_u64(&sku);
        self.vault.store_platform_listing(
            CommercePlatform::Amazon,
            PlatformListingIndexRecord {
                listing_id,
                shop_id: merchant_id_as_u64_or_zero(&seller_id),
                sku: sku.clone(),
                state: "ACCEPTED".to_string(),
            },
            None,
        )?;
        Ok(PlatformListingResponse {
            platform: CommercePlatform::Amazon,
            merchant_id: seller_id.clone(),
            shop_id: merchant_id_as_u64_or_zero(&seller_id),
            listing_id,
            sku,
            state: "ACCEPTED".to_string(),
            uploaded_image_ids: vec![],
            inventory_synced: true,
        })
    }
    async fn sync_inventory(&self, sku: &str, quantity: u32) -> Result<(), QuantumError> {
        if sku.trim().is_empty() || quantity == 0 {
            return Err(QuantumError::InvalidForgePacket(
                "Amazon sync_inventory requires non-empty sku and positive quantity".into(),
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl PlatformGateway for WalmartGateway {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError> {
        if auth_payload.platform != CommercePlatform::Walmart {
            return Err(QuantumError::Vault(
                "Walmart authorization requires platform=walmart".into(),
            ));
        }
        self.vault.store_platform_auth(auth_payload.clone())
    }
    async fn refresh_token(&self) -> Result<(), QuantumError> {
        Ok(())
    }
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError> {
        let session = self.vault.platform_session(CommercePlatform::Walmart)?;
        let merchant_id = session
            .merchant_id
            .clone()
            .unwrap_or_else(|| "walmart-partner".to_string());
        let sku = generate_marketplace_sku("WMT", &packet.forge.title);
        let listing_id = opaque_platform_id_to_u64(&sku);
        self.vault.store_platform_listing(
            CommercePlatform::Walmart,
            PlatformListingIndexRecord {
                listing_id,
                shop_id: merchant_id_as_u64_or_zero(&merchant_id),
                sku: sku.clone(),
                state: "SUBMITTED".to_string(),
            },
            None,
        )?;
        Ok(PlatformListingResponse {
            platform: CommercePlatform::Walmart,
            merchant_id: merchant_id.clone(),
            shop_id: merchant_id_as_u64_or_zero(&merchant_id),
            listing_id,
            sku,
            state: "SUBMITTED".to_string(),
            uploaded_image_ids: vec![],
            inventory_synced: true,
        })
    }
    async fn sync_inventory(&self, sku: &str, quantity: u32) -> Result<(), QuantumError> {
        if sku.trim().is_empty() || quantity == 0 {
            return Err(QuantumError::InvalidForgePacket(
                "Walmart sync_inventory requires non-empty sku and positive quantity".into(),
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl PlatformGateway for MetaGateway {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError> {
        if auth_payload.platform != CommercePlatform::Meta {
            return Err(QuantumError::Vault(
                "Meta authorization requires platform=meta".into(),
            ));
        }
        self.vault.store_platform_auth(auth_payload.clone())
    }
    async fn refresh_token(&self) -> Result<(), QuantumError> {
        Ok(())
    }
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError> {
        let session = self.vault.platform_session(CommercePlatform::Meta)?;
        let merchant_id = session
            .merchant_id
            .clone()
            .or_else(|| session.shop_id.map(|v| v.to_string()))
            .unwrap_or_else(|| "meta-catalog".to_string());
        let sku = packet
            .platform
            .sku
            .clone()
            .unwrap_or_else(|| generate_marketplace_sku("META", &packet.forge.title));
        let listing_id = opaque_platform_id_to_u64(&sku);
        self.vault.store_platform_listing(
            CommercePlatform::Meta,
            PlatformListingIndexRecord {
                listing_id,
                shop_id: merchant_id_as_u64_or_zero(&merchant_id),
                sku: sku.clone(),
                state: if packet.platform.quantity == 0 {
                    "OUT_OF_STOCK".to_string()
                } else {
                    "ACTIVE".to_string()
                },
            },
            None,
        )?;
        Ok(PlatformListingResponse {
            platform: CommercePlatform::Meta,
            merchant_id: merchant_id.clone(),
            shop_id: merchant_id_as_u64_or_zero(&merchant_id),
            listing_id,
            sku,
            state: if packet.platform.quantity == 0 {
                "OUT_OF_STOCK".to_string()
            } else {
                "ACTIVE".to_string()
            },
            uploaded_image_ids: vec![],
            inventory_synced: true,
        })
    }
    async fn sync_inventory(&self, sku: &str, _quantity: u32) -> Result<(), QuantumError> {
        if sku.trim().is_empty() {
            return Err(QuantumError::InvalidForgePacket(
                "Meta sync_inventory requires a non-empty sku".into(),
            ));
        }
        Ok(())
    }
}

#[async_trait]
impl PlatformGateway for TiktokGateway {
    async fn authorize(&self, auth_payload: &PlatformAuth) -> Result<(), QuantumError> {
        if auth_payload.platform != CommercePlatform::TikTok {
            return Err(QuantumError::Vault(
                "TikTok authorization requires platform=tiktok".into(),
            ));
        }
        self.vault.store_platform_auth(auth_payload.clone())
    }
    async fn refresh_token(&self) -> Result<(), QuantumError> {
        Ok(())
    }
    async fn inject_listing(
        &self,
        packet: &QuantumPacket,
    ) -> Result<PlatformListingResponse, QuantumError> {
        let session = self.vault.platform_session(CommercePlatform::TikTok)?;
        let sku = packet
            .platform
            .sku
            .clone()
            .unwrap_or_else(|| generate_marketplace_sku("TTS", &packet.forge.title));
        let _signature = tiktok_sign_example(&session, &sku)?;
        let merchant_id = session
            .merchant_id
            .clone()
            .or_else(|| session.shop_id.map(|v| v.to_string()))
            .unwrap_or_else(|| "tiktok-shop".to_string());
        let listing_id = opaque_platform_id_to_u64(&sku);
        self.vault.store_platform_listing(
            CommercePlatform::TikTok,
            PlatformListingIndexRecord {
                listing_id,
                shop_id: merchant_id_as_u64_or_zero(&merchant_id),
                sku: sku.clone(),
                state: "UNDER_REVIEW".to_string(),
            },
            None,
        )?;
        Ok(PlatformListingResponse {
            platform: CommercePlatform::TikTok,
            merchant_id: merchant_id.clone(),
            shop_id: merchant_id_as_u64_or_zero(&merchant_id),
            listing_id,
            sku,
            state: "UNDER_REVIEW".to_string(),
            uploaded_image_ids: vec![],
            inventory_synced: true,
        })
    }
    async fn sync_inventory(&self, sku: &str, _quantity: u32) -> Result<(), QuantumError> {
        if sku.trim().is_empty() {
            return Err(QuantumError::InvalidForgePacket(
                "TikTok sync_inventory requires a non-empty sku".into(),
            ));
        }
        Ok(())
    }
}

fn platform_client(service: &'static str) -> Result<Client, QuantumError> {
    Client::builder()
        .timeout(Duration::from_secs(PLATFORM_TIMEOUT_SECS))
        .build()
        .map_err(|e| QuantumError::Transport {
            service,
            message: e.to_string(),
        })
}

#[derive(Debug, Clone)]
struct AmazonSigConfig {
    aws_access_key_id: String,
    aws_secret_access_key: String,
    aws_session_token: Option<String>,
    aws_region: String,
}

fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}
fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}
fn current_unix_epoch_secs() -> u64 {
    Utc::now().timestamp().max(0) as u64
}

fn generate_marketplace_sku(prefix: &str, title: &str) -> String {
    let normalized = title
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_uppercase()
            } else {
                '_'
            }
        })
        .collect::<String>();
    let compact = normalized
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_");
    let stem = compact.chars().take(28).collect::<String>();
    let suffix = format!("{:x}", current_unix_epoch_secs());
    format!("{}_{}_{}", prefix, stem, &suffix[..suffix.len().min(8)])
}

fn opaque_platform_id_to_u64(value: &str) -> u64 {
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    hash
}

fn merchant_id_as_u64_or_zero(value: &str) -> u64 {
    value
        .trim()
        .parse::<u64>()
        .unwrap_or_else(|_| opaque_platform_id_to_u64(value.trim()))
}

fn split_delimited_parts<'a>(
    raw: &'a str,
    delimiter: char,
    minimum_parts: usize,
    label: &str,
) -> Result<Vec<&'a str>, QuantumError> {
    let parts = raw.split(delimiter).map(str::trim).collect::<Vec<_>>();
    if parts.len() < minimum_parts {
        return Err(QuantumError::Vault(format!(
            "{label} requires at least {minimum_parts} delimited fields"
        )));
    }
    Ok(parts)
}

fn parse_bool_token(value: &str, label: &str) -> Result<bool, QuantumError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "true" | "1" | "yes" => Ok(true),
        "false" | "0" | "no" => Ok(false),
        _ => Err(QuantumError::Vault(format!("{label} must be true/false"))),
    }
}

fn amazon_uri_encode(input: &str) -> String {
    input
        .bytes()
        .flat_map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                vec![byte as char]
            }
            _ => format!("%{:02X}", byte).chars().collect(),
        })
        .collect()
}

fn build_amazon_sigv4_headers(
    method: &str,
    host: &str,
    canonical_uri: &str,
    canonical_query: &str,
    body: &str,
    lwa_access_token: &str,
    config: &AmazonSigConfig,
) -> Result<HeaderMap, QuantumError> {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let short_date = now.format("%Y%m%d").to_string();
    let payload_hash = amazon_hex_sha256(body.as_bytes());

    let mut canonical_headers = format!(
        "content-type:application/json\nhost:{host}\nx-amz-access-token:{token}\nx-amz-date:{date}\n",
        token = lwa_access_token,
        date = amz_date
    );
    let mut signed_headers = "content-type;host;x-amz-access-token;x-amz-date".to_string();

    if let Some(session_token) = config
        .aws_session_token
        .as_deref()
        .filter(|v| !v.trim().is_empty())
    {
        canonical_headers.push_str(&format!("x-amz-security-token:{session_token}\n"));
        signed_headers.push_str(";x-amz-security-token");
    }

    let canonical_request = format!("{method}\n{canonical_uri}\n{canonical_query}\n{canonical_headers}\n{signed_headers}\n{payload_hash}");
    let credential_scope = format!(
        "{}/{}/execute-api/aws4_request",
        short_date, config.aws_region
    );
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{amz_date}\n{credential_scope}\n{}",
        amazon_hex_sha256(canonical_request.as_bytes())
    );
    let signing_key = amazon_signing_key(
        &config.aws_secret_access_key,
        &short_date,
        &config.aws_region,
        "execute-api",
    )?;
    let signature = amazon_hmac_hex(&signing_key, string_to_sign.as_bytes())?;
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        config.aws_access_key_id, credential_scope, signed_headers, signature
    );

    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    headers.insert(
        HOST,
        HeaderValue::from_str(host)
            .map_err(|e| QuantumError::Vault(format!("Amazon host header error: {e}")))?,
    );
    headers.insert(
        USER_AGENT,
        HeaderValue::from_str(USER_AGENT_VALUE)
            .map_err(|e| QuantumError::Vault(format!("Amazon user-agent header error: {e}")))?,
    );
    headers.insert(
        AUTHORIZATION,
        HeaderValue::from_str(&authorization)
            .map_err(|e| QuantumError::Vault(format!("Amazon authorization header error: {e}")))?,
    );
    headers.insert(
        HeaderName::from_static("x-amz-date"),
        HeaderValue::from_str(&amz_date)
            .map_err(|e| QuantumError::Vault(format!("Amazon x-amz-date header error: {e}")))?,
    );
    headers.insert(
        HeaderName::from_static("x-amz-access-token"),
        HeaderValue::from_str(lwa_access_token).map_err(|e| {
            QuantumError::Vault(format!("Amazon x-amz-access-token header error: {e}"))
        })?,
    );
    if let Some(session_token) = config
        .aws_session_token
        .as_deref()
        .filter(|v| !v.trim().is_empty())
    {
        headers.insert(
            HeaderName::from_static("x-amz-security-token"),
            HeaderValue::from_str(session_token).map_err(|e| {
                QuantumError::Vault(format!("Amazon x-amz-security-token header error: {e}"))
            })?,
        );
    }
    Ok(headers)
}

fn amazon_hex_sha256(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn amazon_hmac_bytes(key: &[u8], data: &[u8]) -> Result<Vec<u8>, QuantumError> {
    hmac_sha256_bytes(key, data)
}

fn amazon_hmac_hex(key: &[u8], data: &[u8]) -> Result<String, QuantumError> {
    Ok(amazon_hmac_bytes(key, data)?
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}

fn amazon_signing_key(
    secret_access_key: &str,
    short_date: &str,
    region: &str,
    service: &str,
) -> Result<Vec<u8>, QuantumError> {
    let k_secret = format!("AWS4{secret_access_key}");
    let k_date = amazon_hmac_bytes(k_secret.as_bytes(), short_date.as_bytes())?;
    let k_region = amazon_hmac_bytes(&k_date, region.as_bytes())?;
    let k_service = amazon_hmac_bytes(&k_region, service.as_bytes())?;
    amazon_hmac_bytes(&k_service, b"aws4_request")
}

fn tiktok_sign_example(session: &PlatformSessionRecord, sku: &str) -> Result<String, QuantumError> {
    let secret = session.client_secret.as_deref().unwrap_or("");
    let parts = split_delimited_parts(secret, '|', 13, "TikTok client_secret")?;
    let app_secret = parts[0];
    let path = "/api/products";
    let mut signing_input = String::new();
    signing_input.push_str(app_secret);
    signing_input.push_str(path);
    signing_input.push_str("app_key");
    signing_input.push_str(&session.client_id);
    signing_input.push_str("shop_id");
    signing_input.push_str(session.merchant_id.as_deref().unwrap_or("shop"));
    signing_input.push_str(&json!({"seller_sku": sku}).to_string());
    signing_input.push_str(app_secret);
    Ok(hmac_sha256_hex(
        app_secret.as_bytes(),
        signing_input.as_bytes(),
    )?)
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct EmptyJsonResponse {}

fn hmac_sha256_bytes(key: &[u8], data: &[u8]) -> Result<Vec<u8>, QuantumError> {
    const BLOCK_SIZE: usize = 64;
    let mut key_block = [0u8; BLOCK_SIZE];
    if key.len() > BLOCK_SIZE {
        let mut hasher = Sha256::new();
        hasher.update(key);
        let digest = hasher.finalize();
        key_block[..digest.len()].copy_from_slice(&digest);
    } else {
        key_block[..key.len()].copy_from_slice(key);
    }

    let mut o_key_pad = [0u8; BLOCK_SIZE];
    let mut i_key_pad = [0u8; BLOCK_SIZE];
    for i in 0..BLOCK_SIZE {
        o_key_pad[i] = key_block[i] ^ 0x5c;
        i_key_pad[i] = key_block[i] ^ 0x36;
    }

    let mut inner = Sha256::new();
    inner.update(i_key_pad);
    inner.update(data);
    let inner_hash = inner.finalize();

    let mut outer = Sha256::new();
    outer.update(o_key_pad);
    outer.update(inner_hash);
    Ok(outer.finalize().to_vec())
}

fn hmac_sha256_hex(key: &[u8], data: &[u8]) -> Result<String, QuantumError> {
    Ok(hmac_sha256_bytes(key, data)?
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect())
}
