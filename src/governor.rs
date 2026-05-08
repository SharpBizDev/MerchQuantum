use crate::models::ForceState;
use crc32fast::Hasher;

pub const GOVERNOR_SECTOR_COUNT: u8 = 96;
pub const OVER_UNITY_RELEVANCE_FLOOR: f32 = 0.85;

#[derive(Debug, Clone)]
pub struct TierZeroSector {
    pub sector_id: u8,
    pub label: String,
    pub articulation: String,
}

#[derive(Debug, Clone)]
pub struct TierZeroBloom {
    pub topic_id: u32,
    pub subject: String,
    pub sectors: Vec<TierZeroSector>,
}

#[derive(Debug, Clone)]
pub enum OverUnityGate {
    Stable { relevance: f32 },
    ForceProtocol {
        relevance: f32,
        force_state: ForceState,
        rearticulated_subject: String,
    },
}

pub fn bloom_subject(subject: &str) -> TierZeroBloom {
    let normalized = normalize_subject(subject);
    let topic_id = topic_id_for_subject(&normalized);
    let sectors = (0..GOVERNOR_SECTOR_COUNT)
        .map(|sector_id| TierZeroSector {
            sector_id,
            label: sector_label(sector_id),
            articulation: sector_articulation(&normalized, sector_id),
        })
        .collect();

    TierZeroBloom {
        topic_id,
        subject: normalized,
        sectors,
    }
}

pub fn topic_id_for_subject(subject: &str) -> u32 {
    let mut hasher = Hasher::new();
    hasher.update(normalize_subject(subject).as_bytes());
    hasher.finalize()
}

pub fn sector_label(sector_id: u8) -> String {
    let harmonic = ["vector", "lattice", "signal"][(sector_id as usize) % 3];
    let octave = sector_id / 3;
    format!("{harmonic}-{octave:02}")
}

pub fn sector_articulation(subject: &str, sector_id: u8) -> String {
    let petals = [
        "definition",
        "evidence",
        "exceptions",
        "mechanics",
        "constraints",
        "failure-modes",
        "applications",
        "dependencies",
    ];
    let petal = petals[(sector_id as usize) % petals.len()];
    let phase = (sector_id as usize / petals.len()) + 1;
    format!("{} :: sector {:02} :: {} :: phase {}", normalize_subject(subject), sector_id, petal, phase)
}

pub fn evaluate_relevance(subject: &str, purified_text: &str, refined_yaml: &str) -> OverUnityGate {
    let relevance = semantic_overlap_score(subject, purified_text, refined_yaml);
    if relevance < OVER_UNITY_RELEVANCE_FLOOR {
        let force_state = if relevance < 0.55 {
            ForceState::RewriteSubject
        } else if relevance < 0.72 {
            ForceState::EscalateUpstream
        } else {
            ForceState::RefineLocal
        };
        OverUnityGate::ForceProtocol {
            relevance,
            force_state,
            rearticulated_subject: force_protocol_articulation(subject, force_state),
        }
    } else {
        OverUnityGate::Stable { relevance }
    }
}

fn semantic_overlap_score(subject: &str, purified_text: &str, refined_yaml: &str) -> f32 {
    let subject_terms = tokenize(subject);
    if subject_terms.is_empty() {
        return 1.0;
    }

    let corpus = format!("{} {}", purified_text, refined_yaml).to_ascii_lowercase();
    let matches = subject_terms
        .iter()
        .filter(|term| corpus.contains(term.as_str()))
        .count();

    (matches as f32 / subject_terms.len() as f32).clamp(0.0, 1.0)
}

fn force_protocol_articulation(subject: &str, force_state: ForceState) -> String {
    let directive = match force_state {
        ForceState::RefineLocal => "tighten local parsing against the current evidence band",
        ForceState::EscalateUpstream => "discard the weak extraction and request a stronger upstream source",
        ForceState::RewriteSubject => "rewrite the sector articulation from first principles and verified evidence",
        ForceState::NullSector => "terminate this sector to preserve scheduler integrity",
    };
    format!(
        "Force Protocol :: {} :: '{}'",
        directive,
        normalize_subject(subject)
    )
}

fn normalize_subject(subject: &str) -> String {
    let trimmed = subject.trim();
    if trimmed.is_empty() {
        "CommandQuantum Research Subject".to_string()
    } else {
        trimmed.to_string()
    }
}

fn tokenize(value: &str) -> Vec<String> {
    value
        .split(|ch: char| !ch.is_ascii_alphanumeric())
        .filter(|token| token.len() >= 4)
        .map(|token| token.to_ascii_lowercase())
        .collect()
}


