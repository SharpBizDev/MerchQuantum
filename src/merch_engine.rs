use crate::models::QuantumError;
use serde::Serialize;

const GENERIC_FILENAME_TOKENS: &[&str] = &[
    "img", "image", "final", "draft", "copy", "transparent", "artwork", "design",
    "graphic", "mockup", "upload", "listing", "print", "product", "merch",
];

#[derive(Debug, Clone)]
pub struct MerchListingRequest {
    pub file_name: String,
    pub image_bytes: Vec<u8>,
    pub title_hint: Option<String>,
    pub product_family: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MerchVisionRecord {
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub aspect_ratio: f32,
    pub byte_length: usize,
    pub filename_keywords: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MerchListingResult {
    pub qc_approved: bool,
    pub publish_ready: bool,
    pub title: String,
    pub description: String,
    pub tags: Vec<String>,
    pub confidence: f32,
    pub reason_flags: Vec<String>,
    pub vision: MerchVisionRecord,
}

pub struct MerchEngine;

impl MerchEngine {
    pub fn new() -> Self {
        Self
    }

    pub fn generate_listing(
        &self,
        request: MerchListingRequest,
    ) -> Result<MerchListingResult, QuantumError> {
        let vision = inspect_image(&request.file_name, &request.image_bytes)?;
        let family = normalize_product_family(request.product_family.as_deref());
        let title = build_title(request.title_hint.as_deref(), &vision.filename_keywords, family);
        let description = build_description(&title, family, &vision);
        let tags = build_tags(&vision.filename_keywords, family, &vision);
        let reason_flags = build_reason_flags(&vision, &tags);
        let qc_approved = !vision.filename_keywords.is_empty() && vision.width >= 64 && vision.height >= 64;
        let publish_ready = qc_approved && tags.len() >= 3;
        let confidence = if publish_ready { 0.88 } else if qc_approved { 0.72 } else { 0.41 };

        Ok(MerchListingResult {
            qc_approved,
            publish_ready,
            title,
            description,
            tags,
            confidence,
            reason_flags,
            vision,
        })
    }
}

fn inspect_image(file_name: &str, bytes: &[u8]) -> Result<MerchVisionRecord, QuantumError> {
    let (mime_type, width, height) = if let Some(dimensions) = parse_png(bytes) {
        ("image/png".to_string(), dimensions.0, dimensions.1)
    } else if let Some(dimensions) = parse_jpeg(bytes) {
        ("image/jpeg".to_string(), dimensions.0, dimensions.1)
    } else if let Some(dimensions) = parse_gif(bytes) {
        ("image/gif".to_string(), dimensions.0, dimensions.1)
    } else {
        return Err(QuantumError::InvalidImageDataUrl);
    };

    let filename_keywords = extract_keywords(file_name);
    let aspect_ratio = if height == 0 {
        1.0
    } else {
        width as f32 / height as f32
    };

    Ok(MerchVisionRecord {
        mime_type,
        width,
        height,
        aspect_ratio,
        byte_length: bytes.len(),
        filename_keywords,
    })
}

fn parse_png(bytes: &[u8]) -> Option<(u32, u32)> {
    const PNG_SIGNATURE: &[u8; 8] = b"\x89PNG\r\n\x1a\n";
    if bytes.len() < 24 || &bytes[..8] != PNG_SIGNATURE {
        return None;
    }

    Some((
        u32::from_be_bytes(bytes[16..20].try_into().ok()?),
        u32::from_be_bytes(bytes[20..24].try_into().ok()?),
    ))
}

fn parse_gif(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 10 {
        return None;
    }

    let header = &bytes[..6];
    if header != b"GIF87a" && header != b"GIF89a" {
        return None;
    }

    Some((
        u16::from_le_bytes(bytes[6..8].try_into().ok()?) as u32,
        u16::from_le_bytes(bytes[8..10].try_into().ok()?) as u32,
    ))
}

fn parse_jpeg(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 4 || bytes[0] != 0xff || bytes[1] != 0xd8 {
        return None;
    }

    let mut offset = 2usize;
    while offset + 9 < bytes.len() {
        while offset < bytes.len() && bytes[offset] != 0xff {
            offset += 1;
        }
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset + 1 >= bytes.len() {
            break;
        }

        let marker = bytes[offset];
        offset += 1;

        if marker == 0xd9 || marker == 0xda || offset + 1 >= bytes.len() {
            break;
        }

        let segment_len = u16::from_be_bytes(bytes[offset..offset + 2].try_into().ok()?) as usize;
        if segment_len < 2 || offset + segment_len > bytes.len() {
            break;
        }

        let is_start_of_frame = matches!(
            marker,
            0xc0 | 0xc1 | 0xc2 | 0xc3 | 0xc5 | 0xc6 | 0xc7 | 0xc9 | 0xca | 0xcb | 0xcd | 0xce | 0xcf
        );

        if is_start_of_frame && offset + 7 < bytes.len() {
            let height = u16::from_be_bytes(bytes[offset + 3..offset + 5].try_into().ok()?) as u32;
            let width = u16::from_be_bytes(bytes[offset + 5..offset + 7].try_into().ok()?) as u32;
            return Some((width, height));
        }

        offset += segment_len;
    }

    None
}

fn extract_keywords(file_name: &str) -> Vec<String> {
    let stem = file_name
        .rsplit_once('.')
        .map(|(left, _)| left)
        .unwrap_or(file_name);

    let mut keywords = Vec::new();
    for token in stem
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .map(|token| token.trim().to_ascii_lowercase())
        .filter(|token| token.len() >= 3)
    {
        if GENERIC_FILENAME_TOKENS.contains(&token.as_str()) {
            continue;
        }
        if !keywords.iter().any(|current| current == &token) {
            keywords.push(token);
        }
    }

    keywords
}

fn normalize_product_family(value: Option<&str>) -> &str {
    let normalized = value.unwrap_or("shirt").trim().to_ascii_lowercase();
    match normalized.as_str() {
        "hoodie" | "sweatshirt" | "poster" | "mug" | "sticker" => Box::leak(normalized.into_boxed_str()),
        _ => "shirt",
    }
}

fn build_title(title_hint: Option<&str>, keywords: &[String], product_family: &str) -> String {
    if let Some(hint) = title_hint.map(str::trim).filter(|hint| !hint.is_empty()) {
        return hint.to_string();
    }

    let core = if keywords.is_empty() {
        "Signal Artwork".to_string()
    } else {
        keywords
            .iter()
            .take(4)
            .map(|token| capitalize_token(token))
            .collect::<Vec<_>>()
            .join(" ")
    };

    format!("{core} {}", capitalize_token(product_family)).trim().to_string()
}

fn build_description(title: &str, product_family: &str, vision: &MerchVisionRecord) -> String {
    let shape_signal = if vision.aspect_ratio > 1.35 {
        "wide-format composition"
    } else if vision.aspect_ratio < 0.8 {
        "vertical composition"
    } else {
        "balanced square composition"
    };

    format!(
        "{title} is prepared as a native {product_family} listing from an internal Rust vision pass. The source art scanned at {}x{} with a {shape_signal}, producing a buyer-facing draft that stays inside the monolith without any local web-server dependency.\n\nUse this draft as the sovereign baseline for further marketplace refinement, pricing, and provider routing.",
        vision.width,
        vision.height,
    )
}

fn build_tags(keywords: &[String], product_family: &str, vision: &MerchVisionRecord) -> Vec<String> {
    let mut tags = Vec::new();
    for token in keywords.iter().take(10) {
        tags.push(token.clone());
    }
    push_unique(&mut tags, product_family.to_string());
    push_unique(&mut tags, vision.mime_type.replace("image/", ""));
    push_unique(&mut tags, if vision.aspect_ratio > 1.15 { "landscape" } else if vision.aspect_ratio < 0.85 { "portrait" } else { "square" }.to_string());
    tags
}

fn build_reason_flags(vision: &MerchVisionRecord, tags: &[String]) -> Vec<String> {
    let mut flags = Vec::new();
    if vision.filename_keywords.is_empty() {
        flags.push("filename_signal_weak".to_string());
    }
    if vision.width < 512 || vision.height < 512 {
        flags.push("source_resolution_low".to_string());
    }
    if tags.len() < 3 {
        flags.push("tag_surface_thin".to_string());
    }
    flags
}

fn push_unique(values: &mut Vec<String>, next: String) {
    if !values.iter().any(|current| current.eq_ignore_ascii_case(&next)) {
        values.push(next);
    }
}

fn capitalize_token(value: &str) -> String {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    format!("{}{}", first.to_ascii_uppercase(), chars.as_str())
}

