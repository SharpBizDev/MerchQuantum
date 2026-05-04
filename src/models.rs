use dioxus::prelude::Writable;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fmt;
#[cfg(not(target_arch = "wasm32"))]
use std::path::PathBuf;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FulfillmentProvider {
    Printify,
    Printful,
    Apliiq,
    Gooten,
    Spreadconnect,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommercePlatform {
    Etsy,
    Amazon,
    Ebay,
    Walmart,
    Meta,
    TikTok,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementGuideSource {
    Live,
    Fallback,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlacementPosition {
    Front,
    Back,
    SleeveLeft,
    SleeveRight,
    Default,
    Custom(String),
}

impl PlacementPosition {
    pub fn as_str(&self) -> &str {
        match self {
            Self::Front => "front",
            Self::Back => "back",
            Self::SleeveLeft => "sleeve_left",
            Self::SleeveRight => "sleeve_right",
            Self::Default => "default",
            Self::Custom(value) => value.as_str(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlacementGuide {
    pub position: PlacementPosition,
    pub width: f64,
    pub height: f64,
    pub source: PlacementGuideSource,
    pub decoration_method: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ArtworkBounds {
    pub canvas_width: Option<f64>,
    pub canvas_height: Option<f64>,
    pub visible_left: Option<f64>,
    pub visible_top: Option<f64>,
    pub visible_width: Option<f64>,
    pub visible_height: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtworkPayload {
    pub file_name: String,
    pub image_data_url: String,
    pub artwork_bounds: Option<ArtworkBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForgeOutput {
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub qc_approved: bool,
    pub publish_ready: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintifyTemplateContext {
    pub template_id: String,
    pub blueprint_id: u64,
    pub print_provider_id: u64,
    pub placement_guide: PlacementGuide,
    pub variants: Vec<PrintifyTemplateVariant>,
    pub print_areas: Vec<PrintifyPrintArea>,
    pub print_details: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintifyTemplateVariant {
    pub id: u64,
    pub price: u32,
    pub is_enabled: bool,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintifyPrintArea {
    pub variant_ids: Option<Vec<u64>>,
    pub placeholders: Option<Vec<PrintifyPlaceholder>>,
    pub background: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintifyPlaceholder {
    pub position: Option<String>,
    pub images: Option<Vec<PrintifyPlaceholderImage>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintifyPlaceholderImage {
    pub id: Option<String>,
    pub src: Option<String>,
    pub name: Option<String>,
    #[serde(rename = "type")]
    pub mime_type: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub scale: Option<f64>,
    pub angle: Option<f64>,
    pub pattern: Option<Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintfulTemplateContext {
    pub thumbnail_url: Option<String>,
    pub placement_guide: PlacementGuide,
    pub variants: Vec<PrintfulSyncVariantContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintfulSyncVariantContext {
    pub variant_id: u64,
    pub retail_price: Option<String>,
    pub options: Vec<PrintfulVariantOptionContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintfulVariantOptionContext {
    pub id: Option<String>,
    pub value: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApliiqTemplateContext {
    pub product_id: u64,
    pub product_code: String,
    pub default_color_id: u64,
    pub preferred_location_id: u64,
    pub preferred_location_name: String,
    pub preferred_service: String,
    pub preferred_print_colors: Option<String>,
    pub hosted_artwork_url: String,
    pub placement_guide: PlacementGuide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GootenTemplateContext {
    pub product_id: u64,
    pub sku: String,
    pub template_name: String,
    pub space_id: String,
    pub space_description: Option<String>,
    pub hosted_artwork_url: String,
    pub placement_guide: PlacementGuide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpreadconnectTemplateContext {
    pub product_type_id: String,
    pub preferred_appearance_id: String,
    pub preferred_size_id: String,
    pub preferred_view: String,
    pub preferred_hotspot: String,
    pub base_price: f64,
    pub placement_guide: PlacementGuide,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "provider", rename_all = "snake_case")]
pub enum ProviderTemplateContext {
    Printify(PrintifyTemplateContext),
    Printful(PrintfulTemplateContext),
    Apliiq(ApliiqTemplateContext),
    Gooten(GootenTemplateContext),
    Spreadconnect(SpreadconnectTemplateContext),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum EtsyWhoMade {
    #[serde(rename = "i_did")]
    IDid,
    #[serde(rename = "someone_else")]
    SomeoneElse,
    #[serde(rename = "collective")]
    Collective,
}

impl EtsyWhoMade {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::IDid => "i_did",
            Self::SomeoneElse => "someone_else",
            Self::Collective => "collective",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EtsyWhenMade(pub String);

impl EtsyWhenMade {
    pub fn validated(&self) -> Result<&str, QuantumError> {
        let value = self.0.trim();
        if value.is_empty() {
            return Err(QuantumError::Vault(
                "Etsy when_made must be a valid Etsy Open API value".into(),
            ));
        }
        Ok(value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EtsyPacketContext {
    pub shop_id: u64,
    pub taxonomy_id: u64,
    pub shipping_profile_id: u64,
    pub readiness_state_id: u64,
    pub who_made: EtsyWhoMade,
    pub when_made: EtsyWhenMade,
    pub should_activate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformPacketContext {
    pub sku: Option<String>,
    pub quantity: u32,
    pub price_major: f64,
    pub mockup_urls: Vec<String>,
    pub etsy: Option<EtsyPacketContext>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumPacket {
    pub provider: FulfillmentProvider,
    pub store_id: String,
    pub forge: ForgeOutput,
    pub artwork: ArtworkPayload,
    pub template: ProviderTemplateContext,
    pub platform: PlatformPacketContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformAuth {
    pub platform: CommercePlatform,
    pub client_id: String,
    pub client_secret: Option<String>,
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub merchant_id: Option<String>,
    pub shop_id: Option<u64>,
    pub scopes: Vec<String>,
    pub expires_at_epoch_secs: Option<u64>,
}

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformListingResponse {
    pub platform: CommercePlatform,
    pub merchant_id: String,
    pub shop_id: u64,
    pub listing_id: u64,
    pub sku: String,
    pub state: String,
    pub uploaded_image_ids: Vec<u64>,
    pub inventory_synced: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumFulfillmentOrder {
    pub source_platform: CommercePlatform,
    pub external_order_id: String,
    pub fulfillment_store_id: String,
    pub currency: String,
    pub shipping_method: Option<String>,
    pub shipping_address: OrderShippingAddress,
    pub line_items: Vec<OrderLineItem>,
    pub retail_costs: Option<QuantumRetailCosts>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderShippingAddress {
    pub name: String,
    pub company: Option<String>,
    pub address1: String,
    pub address2: Option<String>,
    pub city: String,
    pub state_code: Option<String>,
    pub country_code: String,
    pub zip: String,
    pub phone: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrderLineItem {
    pub sku: String,
    pub quantity: u32,
    pub external_line_item_id: Option<String>,
    pub unit_retail_price: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuantumRetailCosts {
    pub subtotal: String,
    pub discount: String,
    pub shipping: String,
    pub tax: String,
    pub vat: Option<String>,
    pub total: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderOrderResponse {
    pub provider: FulfillmentProvider,
    pub store_id: String,
    pub provider_order_id: String,
    pub external_order_id: String,
    pub status: String,
    pub dashboard_url: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
pub struct Asset {
    pub id: String,
    pub filename: String,
    pub status: String,
    pub metadata: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
pub struct MetadataTemplate {
    pub label: String,
    pub title_prefix: String,
    pub tags: Vec<String>,
    pub provider_settings: std::collections::HashMap<String, String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct QuantumState {
    pub project_name: String,
    pub connections: Vec<String>,
    pub logs: Vec<String>,
    #[serde(default)]
    pub assets: Vec<Asset>,
    #[serde(default)]
    pub selected_asset_id: Option<String>,
    #[serde(default)]
    pub templates: Vec<MetadataTemplate>,
}

impl QuantumState {
    #[cfg(target_arch = "wasm32")]
    pub fn load() -> Self {
        web_sys::window()
            .and_then(|window| window.local_storage().ok().flatten())
            .and_then(|storage| storage.get_item("quantum_state").ok().flatten())
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_else(|| Self {
                project_name: "ContextQuantum_Alpha".to_string(),
                ..Default::default()
            })
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn load() -> Self {
        std::fs::read_to_string(Self::anchor_path())
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
            .unwrap_or_else(|| Self {
                project_name: "ContextQuantum_Alpha".to_string(),
                ..Default::default()
            })
    }

    #[cfg(target_arch = "wasm32")]
    pub fn save(&self) {
        if let Some(storage) = web_sys::window().and_then(|window| window.local_storage().ok().flatten()) {
            if let Ok(json) = serde_json::to_string(self) {
                let _ = storage.set_item("quantum_state", &json);
            }
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    pub fn save(&self) {
        let anchor = Self::anchor_path();
        if let Some(parent) = anchor.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(self) {
            let _ = std::fs::write(anchor, json);
        }
    }

    #[cfg(not(target_arch = "wasm32"))]
    fn anchor_path() -> PathBuf {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".tmp")
            .join("quantum_state.json")
    }
}
#[allow(dead_code)]
pub fn apply_template_to_all(state: &mut dioxus::prelude::Signal<QuantumState>, template: MetadataTemplate) {
    state.with_mut(|snapshot| {
        for asset in snapshot.assets.iter_mut() {
            if asset.status == "Raw" {
                merge_template_metadata(asset, &template);
                asset.status = "Refined".to_string();
            }
        }
    });
}
pub fn merge_template_metadata(asset: &mut Asset, template: &MetadataTemplate) {
    let title_prefix = template.title_prefix.trim();
    if !title_prefix.is_empty() {
        let current_title = asset_metadata_value(asset, "title");
        let next_title = if current_title.trim().is_empty() {
            title_prefix.to_string()
        } else if title_starts_with_prefix(&current_title, title_prefix) {
            current_title
        } else {
            format!("{title_prefix} {}", current_title.trim())
        };
        asset.metadata.insert("title".to_string(), next_title);
    }
    let merged_tags = merge_tags(&parse_tags_csv(&asset_metadata_value(asset, "tags")), &template.tags);
    if !merged_tags.is_empty() {
        asset.metadata.insert("tags".to_string(), merged_tags.join(", "));
    }
    for (key, value) in &template.provider_settings {
        if value.trim().is_empty() {
            continue;
        }
        let should_fill = asset
            .metadata
            .get(key)
            .map(|current| current.trim().is_empty())
            .unwrap_or(true);
        if should_fill {
            asset.metadata.insert(key.clone(), value.clone());
        }
    }
    asset.metadata.insert("template_label".to_string(), template.label.clone());
}
fn asset_metadata_value(asset: &Asset, key: &str) -> String {
    asset.metadata.get(key).cloned().unwrap_or_default()
}
fn title_starts_with_prefix(title: &str, prefix: &str) -> bool {
    let normalized_title = title.trim();
    let normalized_prefix = prefix.trim();
    normalized_title.eq_ignore_ascii_case(normalized_prefix)
        || normalized_title
            .to_ascii_lowercase()
            .starts_with(&format!("{} ", normalized_prefix.to_ascii_lowercase()))
}
fn parse_tags_csv(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(|tag| tag.trim().to_string())
        .filter(|tag| !tag.is_empty())
        .collect()
}
fn merge_tags(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut merged = existing.to_vec();
    for tag in incoming {
        if !merged.iter().any(|current| current.eq_ignore_ascii_case(tag)) {
            merged.push(tag.clone());
        }
    }
    merged
}
#[derive(Debug)]
pub enum QuantumError {
    Vault(String),
    MissingApiKey {
        provider: FulfillmentProvider,
    },
    UnsupportedProviderPacket {
        expected: FulfillmentProvider,
        got: FulfillmentProvider,
    },
    InvalidForgePacket(String),
    InvalidImageDataUrl,
    NoEnabledVariants,
    MissingFrontPrintArea,
    Transport {
        service: &'static str,
        message: String,
    },
    Http {
        service: &'static str,
        status: u16,
        body: String,
    },
    JsonDecode {
        service: &'static str,
        message: String,
        body: String,
    },
}

impl fmt::Display for QuantumError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Vault(message) => write!(f, "vault error: {message}"),
            Self::MissingApiKey { provider } => {
                write!(f, "missing api key for provider {provider:?}")
            }
            Self::UnsupportedProviderPacket { expected, got } => write!(
                f,
                "unsupported provider packet: expected {expected:?}, got {got:?}"
            ),
            Self::InvalidForgePacket(message) => write!(f, "invalid forge packet: {message}"),
            Self::InvalidImageDataUrl => write!(f, "invalid image data url"),
            Self::NoEnabledVariants => write!(f, "template has no enabled variants"),
            Self::MissingFrontPrintArea => {
                write!(
                    f,
                    "unable to determine a front print area from the selected template"
                )
            }
            Self::Transport { service, message } => {
                write!(f, "transport error for {service}: {message}")
            }
            Self::Http {
                service,
                status,
                body,
            } => write!(
                f,
                "upstream http error for {service}: status={status}, body={body}"
            ),
            Self::JsonDecode {
                service,
                message,
                body,
            } => write!(f, "json decode error for {service}: {message}; body={body}"),
        }
    }
}

impl std::error::Error for QuantumError {}
