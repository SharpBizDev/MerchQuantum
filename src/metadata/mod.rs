use serde_json::{json, Map, Value};

pub const GROK4_STRUCTURED_MODEL: &str = "grok-4.1";

pub fn structured_metadata_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": [
            "canonical_title",
            "alt_titles",
            "tags",
            "slug",
            "safety_flags",
            "confidence"
        ],
        "properties": {
            "canonical_title": { "type": "string", "minLength": 1 },
            "alt_titles": {
                "type": "array",
                "items": { "type": "string" },
                "maxItems": 8
            },
            "tags": {
                "type": "array",
                "items": { "type": "string" },
                "maxItems": 16
            },
            "slug": { "type": "string", "minLength": 1 },
            "safety_flags": {
                "type": "array",
                "items": { "type": "string" },
                "maxItems": 12
            },
            "confidence": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0
            }
        }
    })
}

pub fn structured_metadata_request(redacted_yaml: &str) -> Value {
    json!({
        "model": GROK4_STRUCTURED_MODEL,
        "store": false,
        "instructions": "Return only structured metadata for listing synthesis. Respect the provided schema exactly.",
        "input": redacted_yaml,
        "text": {
            "format": {
                "type": "json_schema",
                "name": "quantum_metadata_contract",
                "schema": structured_metadata_schema(),
                "strict": true
            }
        }
    })
}

pub fn redact_egress(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut next = Map::new();
            for (key, entry) in map {
                if key.ends_with("_id") || key.ends_with("_name") {
                    continue;
                }
                next.insert(key.clone(), redact_egress(entry));
            }
            Value::Object(next)
        }
        Value::Array(items) => Value::Array(items.iter().map(redact_egress).collect()),
        _ => value.clone(),
    }
}
