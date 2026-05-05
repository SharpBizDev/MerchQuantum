use crate::ingestion::specialized::SpecializedParser;
use crate::ingestion::{IngestionError, QuantumMeshDimensions, QuantumMetadata};
use std::io::Cursor;

pub struct StlHandler;

impl SpecializedParser for StlHandler {
    fn parse(buffer: Vec<u8>) -> Result<QuantumMetadata, IngestionError> {
        let mut cursor = Cursor::new(buffer);
        let mesh = stl_io::read_stl(&mut cursor).map_err(|error| {
            IngestionError::ParseFailure(format!("STL parser rejected mesh: {error}"))
        })?;

        let dimensions = extract_dimensions(&mesh.vertices);
        let mut metadata = QuantumMetadata::new("stl_io", "stl", "cad").with_summary(
            "STL mesh audited in streaming mode and converted into raw physical bounds.",
        );
        metadata.tags = vec!["cad".to_string(), "stl".to_string(), "mesh".to_string()];
        metadata.insert_attribute("triangle_count", mesh.faces.len().to_string());
        metadata.insert_attribute("vertex_count", mesh.vertices.len().to_string());
        metadata.dimensions = Some(dimensions);
        Ok(metadata)
    }
}

fn extract_dimensions(vertices: &[stl_io::Vector<f32>]) -> QuantumMeshDimensions {
    let mut min_x = f32::INFINITY;
    let mut min_y = f32::INFINITY;
    let mut min_z = f32::INFINITY;
    let mut max_x = f32::NEG_INFINITY;
    let mut max_y = f32::NEG_INFINITY;
    let mut max_z = f32::NEG_INFINITY;

    for vertex in vertices {
        min_x = min_x.min(vertex[0]);
        min_y = min_y.min(vertex[1]);
        min_z = min_z.min(vertex[2]);
        max_x = max_x.max(vertex[0]);
        max_y = max_y.max(vertex[1]);
        max_z = max_z.max(vertex[2]);
    }

    if vertices.is_empty() {
        return QuantumMeshDimensions::default();
    }

    QuantumMeshDimensions {
        min_x,
        min_y,
        min_z,
        max_x,
        max_y,
        max_z,
        width: max_x - min_x,
        height: max_y - min_y,
        depth: max_z - min_z,
    }
}
