use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub struct ColdVaultRecord {
    pub archive_path: PathBuf,
    pub sha256_hex: String,
}

pub fn archive_chunk<P: AsRef<Path>>(
    repo_root: P,
    category_id: u8,
    raw_bytes: &[u8],
) -> Result<ColdVaultRecord, String> {
    let hash = Sha256::digest(raw_bytes);
    let sha256_hex = format!("{:x}", hash);
    let archive_dir = repo_root
        .as_ref()
        .join("vault")
        .join("provenance")
        .join(format!("{category_id:02}"));
    fs::create_dir_all(&archive_dir).map_err(|error| error.to_string())?;

    let archive_path = archive_dir.join(format!("{sha256_hex}.raw.zst"));
    let compressed = zstd::stream::encode_all(raw_bytes, 3).map_err(|error| error.to_string())?;
    fs::write(&archive_path, compressed).map_err(|error| error.to_string())?;

    Ok(ColdVaultRecord {
        archive_path,
        sha256_hex,
    })
}

#[cfg(test)]
mod tests {
    use super::archive_chunk;
    use std::fs;

    #[test]
    fn archives_raw_chunk_to_cold_vault() {
        let temp_root = std::env::temp_dir().join(format!(
            "quantum-cold-vault-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&temp_root);
        fs::create_dir_all(&temp_root).expect("temp root");

        let record = archive_chunk(&temp_root, 7, b"raw provenance payload").expect("archive chunk");
        assert!(record.archive_path.exists());
        assert!(record.archive_path.to_string_lossy().contains("vault\\provenance\\07"));

        let compressed = fs::read(&record.archive_path).expect("archive bytes");
        let inflated = zstd::stream::decode_all(&compressed[..]).expect("inflate archive");
        assert_eq!(inflated, b"raw provenance payload");

        let _ = fs::remove_dir_all(&temp_root);
    }
}
