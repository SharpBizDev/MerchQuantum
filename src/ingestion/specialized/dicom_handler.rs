use crate::ingestion::specialized::SpecializedParser;
use crate::ingestion::{IngestionError, QuantumMetadata};
use dicom_dictionary_std::tags;
use dicom_object::{DicomAttribute, DicomObject, OpenFileOptions, Tag};
use std::io::Cursor;

pub struct DicomHandler;

impl SpecializedParser for DicomHandler {
    fn parse(buffer: Vec<u8>) -> Result<QuantumMetadata, IngestionError> {
        let cursor = Cursor::new(buffer);
        let object = OpenFileOptions::new()
            .read_until(tags::PIXEL_DATA)
            .from_reader(cursor)
            .map_err(|error| {
                IngestionError::ParseFailure(format!("DICOM parser rejected object: {error}"))
            })?;

        let mut metadata = QuantumMetadata::new("dicom-rs", "dicom", "medical").with_summary(
            "DICOM metadata extracted without pixel payload decoding for low-latency medical refinement.",
        );
        metadata.tags = vec![
            "medical".to_string(),
            "dicom".to_string(),
            "metadata-only".to_string(),
        ];

        if let Some(value) = read_tag_string(&object, tags::SOP_CLASS_UID) {
            metadata.insert_section_value("series", "sop_class_uid", value);
        }
        if let Some(value) = read_tag_string(&object, tags::MODALITY) {
            metadata.insert_section_value("series", "modality", value);
        }
        if let Some(value) = read_tag_string(&object, tags::SERIES_DESCRIPTION) {
            metadata.insert_section_value("series", "series_description", value);
        }
        if let Some(value) = read_tag_string(&object, tags::SERIES_INSTANCE_UID) {
            metadata.insert_section_value("series", "series_instance_uid", value);
        }
        if let Some(value) = read_tag_string(&object, tags::STUDY_DESCRIPTION) {
            metadata.insert_section_value("study", "study_description", value);
        }
        if let Some(value) = read_tag_string(&object, tags::PATIENT_NAME) {
            metadata.insert_section_value("patient", "patient_name", value);
        }
        if let Some(value) = read_tag_string(&object, tags::PATIENT_ID) {
            metadata.insert_section_value("patient", "patient_id", value);
        }
        if let Some(value) = read_tag_string(&object, tags::PATIENT_SEX) {
            metadata.insert_section_value("patient", "patient_sex", value);
        }
        if let Some(value) = read_tag_string(&object, tags::PATIENT_BIRTH_DATE) {
            metadata.insert_section_value("patient", "patient_birth_date", value);
        }

        metadata.insert_attribute("pixel_data_stripped", "true");
        Ok(metadata)
    }
}

fn read_tag_string<O>(object: &O, tag: Tag) -> Option<String>
where
    O: DicomObject,
{
    object
        .attr(tag)
        .ok()
        .and_then(|element| DicomAttribute::to_str(&element).ok().map(|value| value.into_owned()))
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

