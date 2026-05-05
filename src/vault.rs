use crate::models::{CommercePlatform, FulfillmentProvider, PlatformAuth, QuantumError};
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::{atomic::{AtomicU64, Ordering}, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformListingIndexRecord {
    pub listing_id: u64,
    pub shop_id: u64,
    pub sku: String,
    pub state: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtsyInventoryTemplate {
    pub listing_id: u64,
    pub shop_id: u64,
    pub sku: String,
    pub price_major: f64,
    pub readiness_state_id: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformSessionRecord {
    pub client_id: String,
    pub client_secret: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub merchant_id: Option<String>,
    pub shop_id: Option<u64>,
    pub scopes: Vec<String>,
    pub expires_at_epoch_secs: Option<u64>,
    pub listings_by_sku: HashMap<String, PlatformListingIndexRecord>,
    pub etsy_inventory_by_sku: HashMap<String, EtsyInventoryTemplate>,
}

#[derive(Debug, Default)]
pub struct PlatformVaultState {
    pub sessions: HashMap<CommercePlatform, PlatformSessionRecord>,
}

type HmacSha256 = Hmac<Sha256>;
static PROVIDER_SESSION_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSessionRecord {
    pub provider: FulfillmentProvider,
    pub opaque_session_id: String,
    pub credential_fingerprint: String,
    pub issued_at_epoch_secs: u64,
}

#[derive(Debug)]
pub struct QuantumVault {
    selected_provider: RwLock<Option<FulfillmentProvider>>,
    selected_platform: RwLock<Option<CommercePlatform>>,
    selected_store_id: RwLock<Option<String>>,
    provider_sessions: RwLock<HashMap<FulfillmentProvider, ProviderSessionRecord>>,
    platform_state: RwLock<PlatformVaultState>,
}

impl QuantumVault {
    pub fn new() -> Self {
        Self {
            selected_provider: RwLock::new(None),
            selected_platform: RwLock::new(None),
            selected_store_id: RwLock::new(None),
            provider_sessions: RwLock::new(HashMap::new()),
            platform_state: RwLock::new(PlatformVaultState::default()),
        }
    }

    pub fn set_selected_provider(&self, provider: FulfillmentProvider) -> Result<(), QuantumError> {
        let mut lock = self
            .selected_provider
            .write()
            .map_err(|_| QuantumError::Vault("selected_provider lock poisoned".into()))?;
        *lock = Some(provider);
        Ok(())
    }

    pub fn selected_provider(&self) -> Result<Option<FulfillmentProvider>, QuantumError> {
        let lock = self
            .selected_provider
            .read()
            .map_err(|_| QuantumError::Vault("selected_provider lock poisoned".into()))?;
        Ok(*lock)
    }

    pub fn set_selected_platform(&self, platform: CommercePlatform) -> Result<(), QuantumError> {
        let mut lock = self
            .selected_platform
            .write()
            .map_err(|_| QuantumError::Vault("selected_platform lock poisoned".into()))?;
        *lock = Some(platform);
        Ok(())
    }

    pub fn selected_platform(&self) -> Result<Option<CommercePlatform>, QuantumError> {
        let lock = self
            .selected_platform
            .read()
            .map_err(|_| QuantumError::Vault("selected_platform lock poisoned".into()))?;
        Ok(*lock)
    }

    pub fn set_selected_store_id(&self, store_id: impl Into<String>) -> Result<(), QuantumError> {
        let mut lock = self
            .selected_store_id
            .write()
            .map_err(|_| QuantumError::Vault("selected_store_id lock poisoned".into()))?;
        *lock = Some(store_id.into());
        Ok(())
    }

    pub fn selected_store_id(&self) -> Result<Option<String>, QuantumError> {
        let lock = self
            .selected_store_id
            .read()
            .map_err(|_| QuantumError::Vault("selected_store_id lock poisoned".into()))?;
        Ok(lock.clone())
    }

    pub fn store_api_key(
        &self,
        provider: FulfillmentProvider,
        api_key: impl Into<String>,
    ) -> Result<(), QuantumError> {
        let mut lock = self
            .provider_sessions
            .write()
            .map_err(|_| QuantumError::Vault("provider_sessions lock poisoned".into()))?;
        let api_key = api_key.into();
        let issued_at_epoch_secs = epoch_secs();
        let credential_fingerprint = fingerprint_credential(&api_key);
        let opaque_session_id = sign_opaque_session_id(provider, &api_key, issued_at_epoch_secs);
        lock.insert(
            provider,
            ProviderSessionRecord {
                provider,
                opaque_session_id,
                credential_fingerprint,
                issued_at_epoch_secs,
            },
        );
        Ok(())
    }

    pub fn api_key_for(
        &self,
        provider: FulfillmentProvider,
    ) -> Result<Option<String>, QuantumError> {
        let lock = self
            .provider_sessions
            .read()
            .map_err(|_| QuantumError::Vault("provider_sessions lock poisoned".into()))?;
        Ok(lock.get(&provider).map(|_| None).unwrap_or(None))
    }

    pub fn provider_session(
        &self,
        provider: FulfillmentProvider,
    ) -> Result<ProviderSessionRecord, QuantumError> {
        let lock = self
            .provider_sessions
            .read()
            .map_err(|_| QuantumError::Vault("provider_sessions lock poisoned".into()))?;

        lock.get(&provider).cloned().ok_or_else(|| {
            QuantumError::Vault(format!("missing provider session for {provider:?}"))
        })
    }

    pub fn store_platform_auth(&self, auth: PlatformAuth) -> Result<(), QuantumError> {
        let platform = auth.platform;
        let merchant_id = auth
            .merchant_id
            .clone()
            .or_else(|| auth.shop_id.map(|value| value.to_string()));

        let record = PlatformSessionRecord {
            client_id: auth.client_id,
            client_secret: auth.client_secret,
            access_token: auth.access_token,
            refresh_token: auth.refresh_token,
            merchant_id,
            shop_id: auth.shop_id,
            scopes: auth.scopes,
            expires_at_epoch_secs: auth.expires_at_epoch_secs,
            listings_by_sku: HashMap::new(),
            etsy_inventory_by_sku: HashMap::new(),
        };

        let mut lock = self
            .platform_state
            .write()
            .map_err(|_| QuantumError::Vault("platform_state lock poisoned".into()))?;
        lock.sessions.insert(platform, record);
        drop(lock);

        self.set_selected_platform(platform)?;
        Ok(())
    }

    pub fn platform_session(
        &self,
        platform: CommercePlatform,
    ) -> Result<PlatformSessionRecord, QuantumError> {
        let lock = self
            .platform_state
            .read()
            .map_err(|_| QuantumError::Vault("platform_state lock poisoned".into()))?;

        lock.sessions.get(&platform).cloned().ok_or_else(|| {
            QuantumError::Vault(format!("missing platform session for {platform:?}"))
        })
    }

    pub fn update_platform_tokens(
        &self,
        platform: CommercePlatform,
        access_token: String,
        refresh_token: Option<String>,
        expires_at_epoch_secs: Option<u64>,
    ) -> Result<(), QuantumError> {
        let mut lock = self
            .platform_state
            .write()
            .map_err(|_| QuantumError::Vault("platform_state lock poisoned".into()))?;

        let session = lock.sessions.get_mut(&platform).ok_or_else(|| {
            QuantumError::Vault(format!("missing platform session for {platform:?}"))
        })?;

        session.access_token = access_token;
        if let Some(refresh) = refresh_token {
            session.refresh_token = Some(refresh);
        }
        session.expires_at_epoch_secs = expires_at_epoch_secs;

        Ok(())
    }

    pub fn store_platform_listing(
        &self,
        platform: CommercePlatform,
        listing: PlatformListingIndexRecord,
        etsy_inventory: Option<EtsyInventoryTemplate>,
    ) -> Result<(), QuantumError> {
        let mut lock = self
            .platform_state
            .write()
            .map_err(|_| QuantumError::Vault("platform_state lock poisoned".into()))?;

        let session = lock.sessions.get_mut(&platform).ok_or_else(|| {
            QuantumError::Vault(format!("missing platform session for {platform:?}"))
        })?;

        session.listings_by_sku.insert(listing.sku.clone(), listing);

        if let Some(template) = etsy_inventory {
            session
                .etsy_inventory_by_sku
                .insert(template.sku.clone(), template);
        }

        Ok(())
    }

    pub fn etsy_inventory_template_by_sku(
        &self,
        sku: &str,
    ) -> Result<EtsyInventoryTemplate, QuantumError> {
        let lock = self
            .platform_state
            .read()
            .map_err(|_| QuantumError::Vault("platform_state lock poisoned".into()))?;

        let session = lock
            .sessions
            .get(&CommercePlatform::Etsy)
            .ok_or_else(|| QuantumError::Vault("missing Etsy platform session".into()))?;

        session
            .etsy_inventory_by_sku
            .get(sku)
            .cloned()
            .ok_or_else(|| {
                QuantumError::Vault(format!("missing Etsy inventory template for sku {sku}"))
            })
    }
}

fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

fn fingerprint_credential(api_key: &str) -> String {
    let digest = Sha256::digest(api_key.as_bytes());
    URL_SAFE_NO_PAD.encode(digest)
}

fn sign_opaque_session_id(
    provider: FulfillmentProvider,
    api_key: &str,
    issued_at_epoch_secs: u64,
) -> String {
    let nonce = PROVIDER_SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    let message = format!("{provider:?}:{issued_at_epoch_secs}:{nonce}");
    let mut mac = HmacSha256::new_from_slice(api_key.as_bytes())
        .expect("HMAC supports arbitrary key lengths");
    mac.update(message.as_bytes());
    let signature = mac.finalize().into_bytes();
    let compact = format!("mq:{}:{}", issued_at_epoch_secs, URL_SAFE_NO_PAD.encode(signature));
    URL_SAFE_NO_PAD.encode(compact.as_bytes())
}

impl Default for QuantumVault {
    fn default() -> Self {
        Self::new()
    }
}
