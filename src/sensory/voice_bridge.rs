#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::ipc::signals::{SurfaceSignalPacket, VisualHudCue};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::micro_cell::{LibrarianIngressPayload, LibrarianIngressRecord, QuantumMicroCell};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::models::QuantumError;
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::neural::engine::{
    enqueue_purified_text,
    observe_human_voice_intensity,
    NeuralIngressPacket,
    NeuralIngressRoute,
};
#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
use crate::ui::surface_projection::dispatch_surface_packet;

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VoiceCueKind {
    HumanIngress,
    AiEgress,
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
impl VoiceCueKind {
    fn cue(self) -> VisualHudCue {
        match self {
            Self::HumanIngress => VisualHudCue::HumanVoiceIngress,
            Self::AiEgress => VisualHudCue::AiVoiceEgress,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::HumanIngress => "human-voice",
            Self::AiEgress => "ai-voice",
        }
    }
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
pub struct VoiceBridge {
    micro_cell: QuantumMicroCell,
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
impl VoiceBridge {
    pub fn new() -> Result<Self, QuantumError> {
        let micro_cell = QuantumMicroCell::new()
            .map_err(|error| QuantumError::CriticalFault(format!("voice bridge micro-cell init failed: {error}")))?;
        Ok(Self { micro_cell })
    }

    pub async fn triage_and_dispatch(
        &self,
        kind: VoiceCueKind,
        amplitude_vector: &[f32],
    ) -> Result<u8, QuantumError> {
        let normalized = normalize_amplitude_vector(amplitude_vector);
        let intensity = compute_voice_intensity(&normalized);
        let payload = build_voice_payload(kind, &normalized);

        let ingress = LibrarianIngressPayload {
            corpus_id: format!("{}-spectral-bridge", kind.label()),
            embedding_model: "voice-bridge-u8".to_string(),
            authority: "Sensory Voice Bridge".to_string(),
            records: vec![LibrarianIngressRecord {
                source_label: kind.label().to_string(),
                mime_hint: "text/plain".to_string(),
                content_excerpt: format!("voice_intensity={intensity}"),
                fuel: None,
            }],
        };

        let handle = self.micro_cell
            .instantiate_diskless_librarian(ingress, payload.clone(), None, None)
            .await
            .map_err(|error| QuantumError::CriticalFault(format!("voice bridge micro-cell execution failed: {error}")))?;

        let _ = enqueue_purified_text(NeuralIngressPacket {
            route: NeuralIngressRoute::AsrBridge,
            category_id: None,
            purified_text: handle.purified_text,
            amplitude_hint: intensity,
        });

        if matches!(kind, VoiceCueKind::HumanIngress) && observe_human_voice_intensity(intensity) {
            dispatch_surface_packet(SurfaceSignalPacket::new(VisualHudCue::PulsarStall, intensity));
        }

        dispatch_surface_packet(SurfaceSignalPacket::new(kind.cue(), intensity));
        Ok(intensity)
    }
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn normalize_amplitude_vector(amplitude_vector: &[f32]) -> Vec<u8> {
    amplitude_vector
        .iter()
        .map(|value| (value.clamp(0.0, 1.0) * 255.0).round() as u8)
        .collect()
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn compute_voice_intensity(normalized: &[u8]) -> u8 {
    if normalized.is_empty() {
        return 0;
    }

    let peak = normalized.iter().copied().max().unwrap_or(0) as f32;
    let average = normalized.iter().map(|value| *value as u32).sum::<u32>() as f32 / normalized.len() as f32;
    ((peak * 0.68) + (average * 0.32)).round().clamp(0.0, 255.0) as u8
}

#[cfg(all(feature = "desktop", feature = "micro-cell", not(target_arch = "wasm32")))]
fn build_voice_payload(kind: VoiceCueKind, normalized: &[u8]) -> Vec<u8> {
    let payload = normalized
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(",");
    format!("voice_route:{}\nnormalized_u8:{}", kind.label(), payload).into_bytes()
}

