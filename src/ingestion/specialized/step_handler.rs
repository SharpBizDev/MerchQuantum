use crate::ingestion::specialized::SpecializedParser;
use crate::ingestion::{IngestionError, QuantumMetadata};

pub struct StepHandler;

impl SpecializedParser for StepHandler {
    fn parse(buffer: Vec<u8>) -> Result<QuantumMetadata, IngestionError> {
        let source = String::from_utf8(buffer)?;
        ruststep::parser::parse(&source).map_err(|error| {
            IngestionError::ParseFailure(format!(
                "STEP parser rejected exchange structure: {error}"
            ))
        })?;

        let mut metadata = QuantumMetadata::new("ruststep", "step", "cad").with_summary(
            "STEP exchange structure validated and header metadata extracted without mesh rendering.",
        );
        metadata.tags = vec![
            "cad".to_string(),
            "step".to_string(),
            "exchange-structure".to_string(),
        ];
        metadata.insert_attribute("record_count", count_step_records(&source).to_string());
        metadata.insert_attribute("line_count", source.lines().count().to_string());

        if let Some(description) = extract_step_field(&source, "FILE_DESCRIPTION") {
            metadata.insert_section_value("header", "file_description", description);
        }
        if let Some(name) = extract_step_field(&source, "FILE_NAME") {
            metadata.insert_section_value("header", "file_name", name);
        }
        if let Some(schema) = extract_step_field(&source, "FILE_SCHEMA") {
            metadata.insert_section_value("header", "file_schema", schema);
        }

        Ok(metadata)
    }
}

fn count_step_records(source: &str) -> usize {
    source
        .lines()
        .filter(|line| line.trim_start().starts_with('#'))
        .count()
}

fn extract_step_field(source: &str, field_name: &str) -> Option<String> {
    let needle = format!("{field_name}(");
    let start = source.find(&needle)? + needle.len();
    let tail = &source[start..];
    let end = tail.find(");")?;
    Some(tail[..end].trim().replace("\r", "").replace('\n', " "))
}
