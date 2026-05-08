use crate::merch_engine::{MerchEngine, MerchListingRequest, MerchListingResult};
use crate::models::QuantumError;
use crate::mutex_manager::with_v_drive_write_lock;
use crate::neural::umg::{
    CognitiveDemand, RemoteProvider, UmgImageInput, UmgJsonSchema, UmgRequest,
    UniversalModelGateway,
};
use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_VISION_DETAIL: &str = "high";
const DEFAULT_VISION_MODEL: &str = "grok-4.3";
const DEFAULT_VISION_MAX_OUTPUT_TOKENS: u32 = 900;
const DEFAULT_VISION_TEMPERATURE: f32 = 0.15;

#[derive(Debug, Clone)]
pub struct VisionPipelineRequest {
    pub image_path: PathBuf,
    pub output_path: Option<PathBuf>,
    pub title_hint: Option<String>,
    pub product_family: Option<String>,
}

#[derive(Debug, Clone)]
pub struct VisionPipelineConfig {
    pub model: String,
    pub detail: String,
    pub temperature: f32,
    pub max_output_tokens: u32,
}

impl Default for VisionPipelineConfig {
    fn default() -> Self {
        Self {
            model: DEFAULT_VISION_MODEL.to_string(),
            detail: DEFAULT_VISION_DETAIL.to_string(),
            temperature: DEFAULT_VISION_TEMPERATURE,
            max_output_tokens: DEFAULT_VISION_MAX_OUTPUT_TOKENS,
        }
    }
}

pub trait VisionMetadataForge {
    fn forge_metadata(&self, request: VisionPipelineRequest) -> Result<MerchListingResult, QuantumError>;
}

pub struct VisionPipeline {
    gateway: UniversalModelGateway,
    config: VisionPipelineConfig,
}

impl VisionPipeline {
    pub fn new(gateway: UniversalModelGateway, config: VisionPipelineConfig) -> Self {
        Self { gateway, config }
    }
}

impl Default for VisionPipeline {
    fn default() -> Self {
        Self::new(UniversalModelGateway::default(), VisionPipelineConfig::default())
    }
}

impl VisionMetadataForge for VisionPipeline {
    fn forge_metadata(&self, request: VisionPipelineRequest) -> Result<MerchListingResult, QuantumError> {
        let image_bytes = fs::read(&request.image_path).map_err(|error| {
            QuantumError::IOFailure(format!(
                "failed to read vision source {}: {error}",
                request.image_path.display()
            ))
        })?;
        let file_name = request
            .image_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("vision-source.png")
            .to_string();

        let mut listing = MerchEngine::new().generate_listing(MerchListingRequest {
            file_name,
            image_bytes: image_bytes.clone(),
            title_hint: request.title_hint.clone(),
            product_family: request.product_family.clone(),
        })?;

        let image_url = encode_image_as_data_url(&image_bytes, &listing.vision.mime_type);
        let response = self.gateway.infer(UmgRequest {
            prompt: build_vision_prompt(&request, &listing),
            system_prompt: Some(vision_system_prompt().to_string()),
            demand: CognitiveDemand::Tier2Remote,
            local_engine: None,
            remote_provider: Some(RemoteProvider::Grok),
            model: Some(self.config.model.clone()),
            temperature: Some(self.config.temperature),
            max_output_tokens: Some(self.config.max_output_tokens),
            output_path: None,
            input_images: vec![UmgImageInput {
                image_url,
                detail: Some(self.config.detail.clone()),
            }],
            response_schema: Some(UmgJsonSchema {
                name: "merch_quantum_vision_metadata".to_string(),
                schema: vision_metadata_schema(),
            }),
        })?;

        let forged: VisionMetadataDraft = serde_json::from_str(&response.output_text).map_err(|error| {
            QuantumError::JsonDecode {
                service: "vision-pipeline",
                message: error.to_string(),
                body: response.output_text.clone(),
            }
        })?;

        listing.title = forged.title;
        listing.description = forged.description;
        listing.tags = normalize_tags(forged.tags);
        listing.confidence = forged.confidence.clamp(0.0, 1.0);
        listing.publish_ready = listing.qc_approved && listing.tags.len() >= 3;
        listing.reason_flags.retain(|flag| flag != "tag_surface_thin");
        if listing.tags.len() < 3 {
            listing.reason_flags.push("tag_surface_thin".to_string());
        }

        if let Some(output_path) = request.output_path.as_deref() {
            persist_listing_result(output_path, &listing)?;
        }

        Ok(listing)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct VisionMetadataDraft {
    title: String,
    description: String,
    tags: Vec<String>,
    confidence: f32,
}

fn vision_metadata_schema() -> serde_json::Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["title", "description", "tags", "confidence"],
        "properties": {
            "title": { "type": "string", "minLength": 1 },
            "description": { "type": "string", "minLength": 1 },
            "tags": {
                "type": "array",
                "items": { "type": "string" },
                "maxItems": 16
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0
            }
        }
    })
}

fn vision_system_prompt() -> &'static str {
    "You are the Merch Quantum metadata forge. Read the product image and return buyer-ready merchandise metadata as strict JSON. Stay concrete, avoid policy filler, and keep tags short and searchable."
}

fn build_vision_prompt(request: &VisionPipelineRequest, listing: &MerchListingResult) -> String {
    let family = request.product_family.as_deref().unwrap_or("shirt");
    let title_hint = request.title_hint.as_deref().unwrap_or("");
    format!(
        "Forge ecommerce metadata for this merchandise image. Product family: {family}. Existing local title baseline: {}. Existing local tags: {}. Title hint: {}. Return a concise buyer-ready title, a concrete description, and marketplace tags.",
        listing.title,
        listing.tags.join(", "),
        title_hint,
    )
}

fn encode_image_as_data_url(image_bytes: &[u8], mime_type: &str) -> String {
    let encoded = BASE64_STANDARD.encode(image_bytes);
    format!("data:{mime_type};base64,{encoded}")
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if !normalized
            .iter()
            .any(|current: &String| current.eq_ignore_ascii_case(trimmed))
        {
            normalized.push(trimmed.to_string());
        }
    }
    normalized
}

fn persist_listing_result(path: &Path, listing: &MerchListingResult) -> Result<(), QuantumError> {
    let rendered = serde_json::to_vec_pretty(listing).map_err(|error| {
        QuantumError::CriticalFault(format!(
            "failed to serialize vision listing result for {}: {error}",
            path.display()
        ))
    })?;

    with_v_drive_write_lock(path, || {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                QuantumError::IOFailure(format!(
                    "failed to create vision output directory {}: {error}",
                    parent.display()
                ))
            })?;
        }
        fs::write(path, &rendered).map_err(|error| {
            QuantumError::IOFailure(format!(
                "failed to persist vision metadata to {}: {error}",
                path.display()
            ))
        })?;
        Ok(())
    })
}

#[cfg(test)]
mod tests {
    use super::{encode_image_as_data_url, normalize_tags, vision_metadata_schema};

    #[test]
    fn vision_schema_requires_merch_fields() {
        let schema = vision_metadata_schema();
        let required = schema
            .get("required")
            .and_then(|value| value.as_array())
            .expect("required array");
        assert!(required.iter().any(|value| value.as_str() == Some("title")));
        assert!(required.iter().any(|value| value.as_str() == Some("description")));
        assert!(required.iter().any(|value| value.as_str() == Some("tags")));
    }

    #[test]
    fn encodes_png_bytes_as_data_url() {
        let url = encode_image_as_data_url(b"forge", "image/png");
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn normalizes_duplicate_tags() {
        let tags = normalize_tags(vec![
            "Signal".to_string(),
            "signal".to_string(),
            "  merch  ".to_string(),
        ]);
        assert_eq!(tags, vec!["Signal".to_string(), "merch".to_string()]);
    }
}
