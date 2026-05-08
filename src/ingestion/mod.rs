use crate::governor::OVER_UNITY_RELEVANCE_FLOOR;
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StructuralChunkKind {
    Heading,
    Table,
    CodeBlock,
    ParagraphBand,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeterministicChunk {
    pub chunk_id: u32,
    pub kind: StructuralChunkKind,
    pub markdown: String,
    pub line_start: u32,
    pub line_end: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ValidationMetrics {
    pub structural_integrity: f32,
    pub duplication_ratio: f32,
    pub citation_density: f32,
    pub extraction_confidence: f32,
    pub score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationDecision {
    pub accepted: bool,
    pub metrics: ValidationMetrics,
    pub findings: Vec<String>,
}

pub fn deterministic_structural_chunks(markdown: &str) -> Vec<DeterministicChunk> {
    let mut chunks = Vec::new();
    let mut buffer = Vec::new();
    let mut chunk_id = 0u32;
    let mut line_start = 1u32;
    let mut in_code_block = false;
    let lines = markdown.lines().collect::<Vec<_>>();

    let flush_buffer = |chunks: &mut Vec<DeterministicChunk>, buffer: &mut Vec<String>, kind: StructuralChunkKind, chunk_id: &mut u32, start: u32, end: u32| {
        if buffer.is_empty() {
            return;
        }
        *chunk_id += 1;
        chunks.push(DeterministicChunk {
            chunk_id: *chunk_id,
            kind,
            markdown: buffer.join("\n").trim().to_string(),
            line_start: start,
            line_end: end,
        });
        buffer.clear();
    };

    for (index, line) in lines.iter().enumerate() {
        let line_number = (index + 1) as u32;
        let trimmed = line.trim();

        if trimmed.starts_with("```") {
            if !buffer.is_empty() && !in_code_block {
                flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::ParagraphBand, &mut chunk_id, line_start, line_number.saturating_sub(1));
            }
            if buffer.is_empty() {
                line_start = line_number;
            }
            buffer.push((*line).to_string());
            in_code_block = !in_code_block;
            if !in_code_block {
                flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::CodeBlock, &mut chunk_id, line_start, line_number);
            }
            continue;
        }

        if in_code_block {
            buffer.push((*line).to_string());
            continue;
        }

        if trimmed.starts_with('#') {
            flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::ParagraphBand, &mut chunk_id, line_start, line_number.saturating_sub(1));
            line_start = line_number;
            buffer.push((*line).to_string());
            flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::Heading, &mut chunk_id, line_start, line_number);
            line_start = line_number + 1;
            continue;
        }

        if trimmed.starts_with('|') && trimmed.ends_with('|') {
            if buffer.is_empty() {
                line_start = line_number;
            }
            buffer.push((*line).to_string());
            let next_trimmed = lines.get(index + 1).map(|value| value.trim()).unwrap_or("");
            if !(next_trimmed.starts_with('|') && next_trimmed.ends_with('|')) {
                flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::Table, &mut chunk_id, line_start, line_number);
                line_start = line_number + 1;
            }
            continue;
        }

        if trimmed.is_empty() {
            flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::ParagraphBand, &mut chunk_id, line_start, line_number.saturating_sub(1));
            line_start = line_number + 1;
            continue;
        }

        if buffer.is_empty() {
            line_start = line_number;
        }
        buffer.push((*line).to_string());
        if buffer.len() >= 6 {
            flush_buffer(&mut chunks, &mut buffer, StructuralChunkKind::ParagraphBand, &mut chunk_id, line_start, line_number);
            line_start = line_number + 1;
        }
    }

    flush_buffer(&mut chunks, &mut buffer, if in_code_block { StructuralChunkKind::CodeBlock } else { StructuralChunkKind::ParagraphBand }, &mut chunk_id, line_start, lines.len() as u32);
    chunks.retain(|chunk| !chunk.markdown.is_empty());
    chunks
}

pub fn validate_chunk(chunk: &DeterministicChunk) -> ValidationDecision {
    let normalized_lines = chunk
        .markdown
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_ascii_lowercase())
        .collect::<Vec<_>>();
    let total_lines = normalized_lines.len().max(1) as f32;
    let unique_lines = normalized_lines.iter().collect::<std::collections::BTreeSet<_>>().len() as f32;
    let duplication_ratio = ((total_lines - unique_lines) / total_lines).clamp(0.0, 1.0);
    let citation_hits = chunk
        .markdown
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.contains("http://")
                || trimmed.contains("https://")
                || (trimmed.contains('[') && trimmed.contains("]("))
                || trimmed.starts_with('>')
        })
        .count() as f32;
    let citation_density = (citation_hits / total_lines).clamp(0.0, 1.0);
    let char_count = chunk.markdown.chars().filter(|ch| !ch.is_whitespace()).count() as f32;
    let alnum_count = chunk.markdown.chars().filter(|ch| ch.is_ascii_alphanumeric()).count() as f32;
    let extraction_confidence = if char_count == 0.0 {
        0.0
    } else {
        ((alnum_count / char_count) * if char_count >= 96.0 { 1.0 } else { 0.72 }).clamp(0.0, 1.0)
    };
    let balanced_fence = chunk.markdown.matches("```").count() % 2 == 0;
    let structural_integrity = match chunk.kind {
        StructuralChunkKind::Heading => {
            if chunk.markdown.trim_start().starts_with('#') { 1.0 } else { 0.55 }
        }
        StructuralChunkKind::Table => {
            if chunk.markdown.lines().all(|line| {
                let trimmed = line.trim();
                trimmed.starts_with('|') && trimmed.ends_with('|')
            }) { 0.98 } else { 0.58 }
        }
        StructuralChunkKind::CodeBlock => {
            if balanced_fence { 1.0 } else { 0.42 }
        }
        StructuralChunkKind::ParagraphBand => {
            if char_count >= 64.0 { 0.9 } else { 0.62 }
        }
    };

    let score = (
        structural_integrity * 0.40
        + (1.0 - duplication_ratio) * 0.25
        + citation_density * 0.20
        + extraction_confidence * 0.15
    ).clamp(0.0, 1.0);

    let mut findings = Vec::new();
    if structural_integrity < 0.8 {
        findings.push("validator: weak structural integrity".to_string());
    }
    if duplication_ratio > 0.25 {
        findings.push("validator: duplication ratio exceeds 0.25".to_string());
    }
    if citation_density < 0.05 {
        findings.push("validator: sparse citation density".to_string());
    }
    if extraction_confidence < 0.65 {
        findings.push("validator: extraction confidence below 0.65".to_string());
    }

    ValidationDecision {
        accepted: score >= OVER_UNITY_RELEVANCE_FLOOR,
        metrics: ValidationMetrics {
            structural_integrity,
            duplication_ratio,
            citation_density,
            extraction_confidence,
            score,
        },
        findings,
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


