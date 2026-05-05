use crate::ingestion::{IngestionError, QuantumMetadata};

pub mod dicom_handler;
pub mod step_handler;
pub mod stl_handler;

pub trait SpecializedParser {
    fn parse(buffer: Vec<u8>) -> Result<QuantumMetadata, IngestionError>;
}

pub fn dispatch_specialized_parse(
    kind: &str,
    buffer: Vec<u8>,
) -> Result<QuantumMetadata, IngestionError> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "step" | "stp" | "model/step" | "application/step" => {
            step_handler::StepHandler::parse(buffer)
        }
        "stl" | "model/stl" | "application/sla" => stl_handler::StlHandler::parse(buffer),
        "dicom" | "dcm" | "application/dicom" => dicom_handler::DicomHandler::parse(buffer),
        other => Err(IngestionError::UnsupportedFormat(other.to_string())),
    }
}
