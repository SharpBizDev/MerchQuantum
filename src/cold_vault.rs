use crate::models::{NoveltySeed, ProvenanceHeader};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct ColdVaultRecord {
    pub archive_path: PathBuf,
    pub sha256_hex: String,
    pub provenance_header: ProvenanceHeader,
}

pub fn store_seed<P: AsRef<Path>>(
    repo_root: P,
    provenance_header: ProvenanceHeader,
    seed: &NoveltySeed,
) -> Result<ColdVaultRecord, String> {
    let payload = serde_json::to_vec_pretty(seed).map_err(|error| error.to_string())?;
    let hash = Sha256::digest(&payload);
    let sha256_hex = format!("{:x}", hash);
    let archive_dir = repo_root
        .as_ref()
        .join("vault")
        .join("provenance")
        .join(format!("{:02}", provenance_header.sector_id))
        .join("novelty");
    fs::create_dir_all(&archive_dir).map_err(|error| error.to_string())?;

    let archive_path = archive_dir.join(format!("{sha256_hex}.seed.zst"));
    let compressed = zstd::stream::encode_all(&payload[..], 3).map_err(|error| error.to_string())?;
    fs::write(&archive_path, compressed).map_err(|error| error.to_string())?;

    Ok(ColdVaultRecord {
        archive_path,
        sha256_hex,
        provenance_header,
    })
}

pub fn inflate_archive<P: AsRef<Path>>(archive_path: P) -> Result<Vec<u8>, String> {
    let compressed = fs::read(archive_path.as_ref()).map_err(|error| error.to_string())?;
    zstd::stream::decode_all(&compressed[..]).map_err(|error| error.to_string())
}

pub fn archive_chunk<P: AsRef<Path>>(
    repo_root: P,
    provenance_header: ProvenanceHeader,
    raw_bytes: &[u8],
) -> Result<ColdVaultRecord, String> {
    let hash = Sha256::digest(raw_bytes);
    let sha256_hex = format!("{:x}", hash);
    let archive_dir = repo_root
        .as_ref()
        .join("vault")
        .join("provenance")
        .join(format!("{:02}", provenance_header.sector_id));
    fs::create_dir_all(&archive_dir).map_err(|error| error.to_string())?;

    let archive_path = archive_dir.join(format!("{sha256_hex}.raw.zst"));
    let compressed = zstd::stream::encode_all(raw_bytes, 3).map_err(|error| error.to_string())?;
    fs::write(&archive_path, compressed).map_err(|error| error.to_string())?;

    Ok(ColdVaultRecord {
        archive_path,
        sha256_hex,
        provenance_header,
    })
}

pub fn now_epoch_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::archive_chunk;
    use crate::models::ProvenanceHeader;
    use std::fs;

    #[test]
    fn archives_raw_chunk_to_cold_vault() {
        let temp_root = std::env::temp_dir().join(format!(
            "quantum-cold-vault-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_root);
        fs::create_dir_all(&temp_root).expect("temp root");

        let record = archive_chunk(
            &temp_root,
            ProvenanceHeader {
                topic_id: 77,
                sector_id: 7,
                source_url: "file://test".to_string(),
                timestamp_epoch_ms: 1,
                parent_crc32: 99,
            },
            b"raw provenance payload",
        )
        .expect("archive chunk");
        assert!(record.archive_path.exists());
        assert!(record.archive_path.to_string_lossy().contains("vault\\provenance\\07"));
        assert_eq!(record.provenance_header.sector_id, 7);

        let compressed = fs::read(&record.archive_path).expect("archive bytes");
        let inflated = zstd::stream::decode_all(&compressed[..]).expect("inflate archive");
        assert_eq!(inflated, b"raw provenance payload");

        let _ = fs::remove_dir_all(&temp_root);
    }
}
