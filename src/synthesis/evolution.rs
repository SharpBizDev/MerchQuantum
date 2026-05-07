use crate::cold_vault::{inflate_archive, now_epoch_ms, ColdVaultRecord};
use crate::models::{NoveltySeed, ProvenanceHeader};
use crate::pulsar::enqueue_refinement_task;
use sha2::{Digest, Sha256};
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

const MAX_SEED_DEPTH: u8 = 3;
const SEED_SCAN_INTERVAL: Duration = Duration::from_secs(5);
static SEED_WATCHER_STARTED: OnceLock<()> = OnceLock::new();

pub struct SeedPurifier;

impl SeedPurifier {
    pub fn purify(seed: &NoveltySeed) -> Option<String> {
        if seed.depth_counter > MAX_SEED_DEPTH {
            return None;
        }

        Some(format!(
            "---\nseed_tag: {}\ncategory_id: {}\ndepth_counter: {}\nbeliever_crc32: {}\nskeptic_crc32: {}\ndivergence_ratio: {:.3}\n---\n{}\n",
            seed.tag,
            seed.category_id.unwrap_or(0),
            seed.depth_counter.saturating_add(1),
            seed.believer_crc32,
            seed.skeptic_crc32,
            seed.divergence_ratio,
            seed.seed_excerpt.trim()
        ))
    }
}

pub fn start_seed_feedback_loop(repo_root: PathBuf) {
    if SEED_WATCHER_STARTED.set(()).is_err() {
        return;
    }

    let seen = Arc::new(Mutex::new(BTreeSet::<PathBuf>::new()));
    tokio::spawn(async move {
        loop {
            let _ = scan_and_enqueue_seeds(&repo_root, &seen).await;
            sleep(SEED_SCAN_INTERVAL).await;
        }
    });
}

async fn scan_and_enqueue_seeds(
    repo_root: &Path,
    seen: &Arc<Mutex<BTreeSet<PathBuf>>>,
) -> Result<(), String> {
    let novelty_roots = collect_novelty_archives(repo_root)?;
    for archive_path in novelty_roots {
        let mut seen_guard = seen.lock().await;
        if seen_guard.contains(&archive_path) {
            continue;
        }
        seen_guard.insert(archive_path.clone());
        drop(seen_guard);

        let seed = decode_seed(&archive_path)?;
        if seed.depth_counter > MAX_SEED_DEPTH {
            continue;
        }

        let Some(frontmatter) = SeedPurifier::purify(&seed) else {
            continue;
        };
        let category_id = seed.category_id.unwrap_or(0);
        let archive = store_purified_seed(repo_root, category_id, &frontmatter)?;
        let _ = enqueue_refinement_task(&archive.archive_path);
    }
    Ok(())
}

fn collect_novelty_archives(repo_root: &Path) -> Result<Vec<PathBuf>, String> {
    let vault_root = repo_root.join("vault").join("provenance");
    let mut archives = Vec::new();
    if !vault_root.exists() {
        return Ok(archives);
    }

    for category_entry in fs::read_dir(&vault_root).map_err(|error| error.to_string())? {
        let category_entry = category_entry.map_err(|error| error.to_string())?;
        let novelty_dir = category_entry.path().join("novelty");
        if !novelty_dir.exists() {
            continue;
        }
        for archive in fs::read_dir(&novelty_dir).map_err(|error| error.to_string())? {
            let archive = archive.map_err(|error| error.to_string())?;
            let path = archive.path();
            if path.extension().and_then(|ext| ext.to_str()) == Some("zst") {
                archives.push(path);
            }
        }
    }

    archives.sort();
    Ok(archives)
}

fn decode_seed(archive_path: &Path) -> Result<NoveltySeed, String> {
    let raw = inflate_archive(archive_path)?;
    serde_json::from_slice(&raw).map_err(|error| error.to_string())
}

fn store_purified_seed(
    repo_root: &Path,
    category_id: u8,
    frontmatter: &str,
) -> Result<ColdVaultRecord, String> {
    let payload = frontmatter.as_bytes();
    let hash = Sha256::digest(payload);
    let sha256_hex = format!("{:x}", hash);
    let archive_dir = repo_root
        .join("vault")
        .join("provenance")
        .join(format!("{category_id:02}"))
        .join("refinement");
    fs::create_dir_all(&archive_dir).map_err(|error| error.to_string())?;

    let archive_path = archive_dir.join(format!("{sha256_hex}.raw.zst"));
    let compressed = zstd::stream::encode_all(payload, 3).map_err(|error| error.to_string())?;
    fs::write(&archive_path, compressed).map_err(|error| error.to_string())?;

    Ok(ColdVaultRecord {
        archive_path,
        sha256_hex,
        provenance_header: ProvenanceHeader {
            topic_id: category_id as u32,
            sector_id: category_id,
            source_url: "coldvault://refinement-seed".to_string(),
            timestamp_epoch_ms: now_epoch_ms(),
            parent_crc32: 0,
        },
    })
}
