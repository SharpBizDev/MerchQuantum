use crate::models::{NoveltySeed, SynthesisOutcome};
use crc32fast::Hasher;
use std::collections::{BTreeMap, BTreeSet};

const NOVELTY_DIVERGENCE_THRESHOLD: f32 = 0.18;
const CONTRADICTION_TOKENS: [&str; 7] = [" not ", " however ", " but ", " except ", " unless ", " conflict", " inconsistent"];

pub struct BelieverSkeptic;

impl BelieverSkeptic {
    pub fn execute(raw_utf8: &str, refined_yaml: &str) -> SynthesisOutcome {
        let believer_state = believer_pass(raw_utf8, refined_yaml);
        let skeptic_state = skeptic_pass(raw_utf8, refined_yaml, &believer_state);
        let believer_crc32 = crc32(&believer_state);
        let skeptic_crc32 = crc32(&skeptic_state);
        let divergence_ratio = divergence_ratio(&believer_state, &skeptic_state);
        let novelty_seed = if believer_crc32 != skeptic_crc32 && divergence_ratio >= NOVELTY_DIVERGENCE_THRESHOLD {
            Some(NoveltySeed {
                category_id: None,
                depth_counter: 0,
                tag: "belief_skeptic_divergence".to_string(),
                believer_crc32,
                skeptic_crc32,
                divergence_ratio,
                seed_excerpt: skeptic_state.chars().take(280).collect(),
            })
        } else {
            None
        };

        SynthesisOutcome {
            believer_state,
            skeptic_state,
            believer_crc32,
            skeptic_crc32,
            divergence_ratio,
            novelty_seed,
        }
    }
}

fn believer_pass(raw_utf8: &str, refined_yaml: &str) -> String {
    let mut lines = Vec::new();
    lines.extend(normalized_metadata_lines(raw_utf8));
    lines.extend(normalized_metadata_lines(refined_yaml));
    lines.sort();
    lines.dedup();
    lines.join("\n")
}

fn skeptic_pass(raw_utf8: &str, refined_yaml: &str, believer_state: &str) -> String {
    let believer_lines = believer_state.lines().map(|line| line.to_string()).collect::<BTreeSet<_>>();
    let contradictions = contradiction_lines(raw_utf8)
        .into_iter()
        .chain(contradiction_lines(refined_yaml))
        .collect::<BTreeSet<_>>();

    let conflicts = conflicting_metadata(raw_utf8)
        .into_iter()
        .chain(conflicting_metadata(refined_yaml))
        .collect::<BTreeSet<_>>();

    let mut skeptic = Vec::new();
    for line in contradictions {
        if !believer_lines.contains(&line) {
            skeptic.push(line);
        }
    }
    for line in conflicts {
        skeptic.push(line);
    }
    skeptic.sort();
    skeptic.dedup();
    skeptic.join("\n")
}

fn normalized_metadata_lines(input: &str) -> Vec<String> {
    input
        .lines()
        .filter_map(parse_metadata_line)
        .collect()
}

fn contradiction_lines(input: &str) -> Vec<String> {
    input
        .lines()
        .filter_map(|line| {
            let normalized = squash(line);
            if normalized.is_empty() {
                return None;
            }
            let padded = format!(" {normalized} ");
            if CONTRADICTION_TOKENS.iter().any(|token| padded.contains(token)) {
                Some(normalized)
            } else {
                None
            }
        })
        .collect()
}

fn conflicting_metadata(input: &str) -> Vec<String> {
    let mut seen = BTreeMap::<String, String>::new();
    let mut conflicts = Vec::new();
    for line in input.lines().filter_map(parse_metadata_line) {
        let Some((key, value)) = line.split_once(':') else { continue; };
        let key = key.trim().to_string();
        let value = value.trim().to_string();
        if let Some(existing) = seen.get(&key) {
            if existing != &value {
                conflicts.push(format!("conflict: {key}: {existing} <> {value}"));
            }
        } else {
            seen.insert(key, value);
        }
    }
    conflicts
}

fn parse_metadata_line(line: &str) -> Option<String> {
    let normalized = squash(line);
    let (key, value) = normalized.split_once(':')?;
    let key = key.trim();
    let value = value.trim();
    if key.is_empty() || value.is_empty() {
        return None;
    }
    Some(format!("{key}: {value}"))
}

fn divergence_ratio(left: &str, right: &str) -> f32 {
    let left_set = left.lines().map(|line| line.to_string()).collect::<BTreeSet<_>>();
    let right_set = right.lines().map(|line| line.to_string()).collect::<BTreeSet<_>>();
    if left_set.is_empty() && right_set.is_empty() {
        return 0.0;
    }
    let union = left_set.union(&right_set).count() as f32;
    let shared = left_set.intersection(&right_set).count() as f32;
    ((union - shared) / union).clamp(0.0, 1.0)
}

fn crc32(value: &str) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(value.as_bytes());
    hasher.finalize()
}

fn squash(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_ascii_lowercase()
}
