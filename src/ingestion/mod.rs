use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt;

pub mod specialized;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QuantumMeshDimensions {
    pub min_x: f32,
    pub min_y: f32,
    pub min_z: f32,
    pub max_x: f32,
    pub max_y: f32,
    pub max_z: f32,
    pub width: f32,
    pub height: f32,
    pub depth: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct QuantumMetadata {
    pub parser: String,
    pub format: String,
    pub category: String,
    pub summary: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub attributes: BTreeMap<String, String>,
    #[serde(default)]
    pub sections: BTreeMap<String, BTreeMap<String, String>>,
    pub dimensions: Option<QuantumMeshDimensions>,
}

impl QuantumMetadata {
    pub fn new(
        parser: impl Into<String>,
        format: impl Into<String>,
        category: impl Into<String>,
    ) -> Self {
        Self {
            parser: parser.into(),
            format: format.into(),
            category: category.into(),
            summary: String::new(),
            tags: Vec::new(),
            attributes: BTreeMap::new(),
            sections: BTreeMap::new(),
            dimensions: None,
        }
    }

    pub fn with_summary(mut self, summary: impl Into<String>) -> Self {
        self.summary = summary.into();
        self
    }

    pub fn insert_attribute(&mut self, key: impl Into<String>, value: impl Into<String>) {
        self.attributes.insert(key.into(), value.into());
    }

    pub fn insert_section_value(
        &mut self,
        section: impl Into<String>,
        key: impl Into<String>,
        value: impl Into<String>,
    ) {
        self.sections
            .entry(section.into())
            .or_default()
            .insert(key.into(), value.into());
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum IngestionError {
    UnsupportedFormat(String),
    InvalidUtf8(String),
    ParseFailure(String),
}

impl fmt::Display for IngestionError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedFormat(message) => write!(f, "unsupported format: {message}"),
            Self::InvalidUtf8(message) => write!(f, "invalid utf8: {message}"),
            Self::ParseFailure(message) => write!(f, "parse failure: {message}"),
        }
    }
}

impl std::error::Error for IngestionError {}

impl From<std::string::FromUtf8Error> for IngestionError {
    fn from(error: std::string::FromUtf8Error) -> Self {
        Self::InvalidUtf8(error.to_string())
    }
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn refine_specialized_bytes(
    kind: &str,
    buffer: &[u8],
) -> Result<String, wasm_bindgen::JsValue> {
    use wasm_bindgen::JsValue;

    let metadata = specialized::dispatch_specialized_parse(kind, buffer.to_vec())
        .map_err(|error| JsValue::from_str(&error.to_string()))?;
    serde_json::to_string(&metadata).map_err(|error| JsValue::from_str(&error.to_string()))
}
