#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub const SURFACE_PIPE_NAME: &str = r"\\.\pipe\quantum_core_surface";
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const SURFACE_PACKET_SENTINEL: u8 = 0xA7;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum VisualHudCue {
    Pulse = 0x1A,
    Novelty = 0x1B,
    HumanVoiceIngress = 0x2A,
    AiVoiceEgress = 0x2B,
    NeuralStreamComplete = 0x2C,
    PulsarStall = 0x2D,
    HotSwapDepth = 0x2E,
    JanitorPulse = 0x2F,
    OverlayConsumption = 0x3A,
}

impl VisualHudCue {
    pub fn code(self) -> u8 {
        self as u8
    }

    pub fn from_byte(byte: u8) -> Option<Self> {
        match byte {
            0x1A => Some(Self::Pulse),
            0x1B => Some(Self::Novelty),
            0x2A => Some(Self::HumanVoiceIngress),
            0x2B => Some(Self::AiVoiceEgress),
            0x2C => Some(Self::NeuralStreamComplete),
            0x2D => Some(Self::PulsarStall),
            0x2E => Some(Self::HotSwapDepth),
            0x2F => Some(Self::JanitorPulse),
            0x3A => Some(Self::OverlayConsumption),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SurfaceSignalPacket {
    pub cue: VisualHudCue,
    pub intensity: u8,
}

impl SurfaceSignalPacket {
    pub fn new(cue: VisualHudCue, intensity: u8) -> Self {
        Self { cue, intensity }
    }

    pub fn encode(self) -> [u8; 3] {
        [SURFACE_PACKET_SENTINEL, self.cue.code(), self.intensity]
    }

    pub fn decode(bytes: &[u8]) -> Option<Self> {
        let sentinel = *bytes.first()?;
        if sentinel != SURFACE_PACKET_SENTINEL {
            return None;
        }
        let cue = VisualHudCue::from_byte(*bytes.get(1)?)?;
        let intensity = *bytes.get(2).unwrap_or(&0);
        Some(Self { cue, intensity })
    }
}
