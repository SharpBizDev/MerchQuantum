#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::ipc::signals::{SURFACE_PIPE_NAME, SurfaceSignalPacket, VisualHudCue};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::native_shell::current_hole_score;
use dioxus::prelude::*;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::OnceLock;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicU8, Ordering};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::thread;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use tokio::io::{AsyncReadExt, AsyncWriteExt};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use tokio::net::windows::named_pipe::{ClientOptions, ServerOptions};

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const CATEGORY_RING_SIZE: u8 = 96;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const PULSE_WINDOW_MS: u64 = 780;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const NOVELTY_WINDOW_MS: u64 = 2_400;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const VOICE_WINDOW_MS: u64 = 140;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const PULSAR_STALL_WINDOW_MS: u64 = 540;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const JANITOR_WINDOW_MS: u64 = 220;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const SURFACE_REFRESH_MS: u64 = 16;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct SurfaceProjectionState {
    pub category_pointer: u8,
    pub pulse_active: bool,
    pub novelty_active: bool,
    pub haunted_score: f32,
    pub compact_mode: bool,
    pub ghost_mode: bool,
    pub human_voice_intensity: u8,
    pub ai_voice_intensity: u8,
    pub pulsar_stalled: bool,
    pub overlay_consumption: u8,
    pub janitor_heartbeat_active: bool,
}

impl Default for SurfaceProjectionState {
    fn default() -> Self {
        Self {
            category_pointer: 0,
            pulse_active: false,
            novelty_active: false,
            haunted_score: 0.0,
            compact_mode: false,
            ghost_mode: false,
            human_voice_intensity: 0,
            ai_voice_intensity: 0,
            pulsar_stalled: false,
            overlay_consumption: 0,
            janitor_heartbeat_active: false,
        }
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
struct SurfaceCueState {
    pulse_until_ms: AtomicU64,
    novelty_until_ms: AtomicU64,
    human_until_ms: AtomicU64,
    ai_until_ms: AtomicU64,
    stall_until_ms: AtomicU64,
    janitor_until_ms: AtomicU64,
    category_pointer: AtomicU8,
    human_voice_intensity: AtomicU8,
    ai_voice_intensity: AtomicU8,
    overlay_consumption: AtomicU8,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
impl SurfaceCueState {
    fn new() -> Self {
        Self {
            pulse_until_ms: AtomicU64::new(0),
            novelty_until_ms: AtomicU64::new(0),
            human_until_ms: AtomicU64::new(0),
            ai_until_ms: AtomicU64::new(0),
            stall_until_ms: AtomicU64::new(0),
            janitor_until_ms: AtomicU64::new(0),
            category_pointer: AtomicU8::new(0),
            human_voice_intensity: AtomicU8::new(0),
            ai_voice_intensity: AtomicU8::new(0),
            overlay_consumption: AtomicU8::new(0),
        }
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static SURFACE_DISPATCHER_STARTED: AtomicBool = AtomicBool::new(false);
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static SURFACE_CUE_STATE: OnceLock<SurfaceCueState> = OnceLock::new();

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn cue_state() -> &'static SurfaceCueState {
    SURFACE_CUE_STATE.get_or_init(SurfaceCueState::new)
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn dispatch_surface_packet(packet: SurfaceSignalPacket) {
    thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build();
        let Ok(runtime) = runtime else {
            return;
        };

        runtime.block_on(async move {
            let Ok(mut client) = ClientOptions::new().open(SURFACE_PIPE_NAME) else {
                return;
            };
            let _ = client.write_all(&packet.encode()).await;
            let _ = client.flush().await;
        });
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn dispatch_visual_cue(cue: VisualHudCue) {
    dispatch_surface_packet(SurfaceSignalPacket::new(cue, 0));
}

#[cfg(not(all(feature = "desktop", not(target_arch = "wasm32"))))]
pub fn dispatch_surface_packet(_: crate::ipc::signals::SurfaceSignalPacket) {}

#[cfg(not(all(feature = "desktop", not(target_arch = "wasm32"))))]
pub fn dispatch_visual_cue(_: crate::ipc::signals::VisualHudCue) {}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn ensure_surface_dispatcher() {
    if SURFACE_DISPATCHER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    thread::spawn(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build();
        let Ok(runtime) = runtime else {
            return;
        };

        runtime.block_on(async move {
            loop {
                let server = ServerOptions::new().first_pipe_instance(false).create(SURFACE_PIPE_NAME);
                let Ok(mut server) = server else {
                    tokio::time::sleep(Duration::from_millis(120)).await;
                    continue;
                };

                if server.connect().await.is_err() {
                    tokio::time::sleep(Duration::from_millis(120)).await;
                    continue;
                }

                let mut payload = [0u8; 3];
                if server.read_exact(&mut payload).await.is_ok() {
                    if let Some(packet) = SurfaceSignalPacket::decode(&payload) {
                        apply_surface_packet(packet);
                    }
                }

                let _ = server.disconnect();
            }
        });
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn apply_surface_packet(packet: SurfaceSignalPacket) {
    let state = cue_state();
    let now = now_epoch_ms();
    match packet.cue {
        VisualHudCue::Pulse => {
            let next = (state.category_pointer.load(Ordering::Relaxed) + 1) % CATEGORY_RING_SIZE;
            state.category_pointer.store(next, Ordering::Relaxed);
            state
                .pulse_until_ms
                .store(now.saturating_add(PULSE_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::Novelty => {
            state
                .novelty_until_ms
                .store(now.saturating_add(NOVELTY_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::HumanVoiceIngress => {
            state.human_voice_intensity.store(packet.intensity, Ordering::Relaxed);
            state
                .human_until_ms
                .store(now.saturating_add(VOICE_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::AiVoiceEgress => {
            state.ai_voice_intensity.store(packet.intensity, Ordering::Relaxed);
            state
                .ai_until_ms
                .store(now.saturating_add(VOICE_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::NeuralStreamComplete => {
            state.ai_voice_intensity.store(0, Ordering::Relaxed);
            state.ai_until_ms.store(now, Ordering::Relaxed);
        }
        VisualHudCue::PulsarStall => {
            state
                .stall_until_ms
                .store(now.saturating_add(PULSAR_STALL_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::HotSwapDepth => {}
        VisualHudCue::JanitorPulse => {
            state
                .janitor_until_ms
                .store(now.saturating_add(JANITOR_WINDOW_MS), Ordering::Relaxed);
        }
        VisualHudCue::OverlayConsumption => {
            state.overlay_consumption.store(packet.intensity, Ordering::Relaxed);
        }
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn snapshot_surface_projection() -> SurfaceProjectionState {
    let state = cue_state();
    let now = now_epoch_ms();
    let hole = current_hole_score();

    let human_active = now <= state.human_until_ms.load(Ordering::Relaxed);
    let ai_active = now <= state.ai_until_ms.load(Ordering::Relaxed);

    SurfaceProjectionState {
        category_pointer: state.category_pointer.load(Ordering::Relaxed),
        pulse_active: now <= state.pulse_until_ms.load(Ordering::Relaxed),
        novelty_active: now <= state.novelty_until_ms.load(Ordering::Relaxed),
        haunted_score: hole.score,
        compact_mode: hole.compact_mode,
        ghost_mode: hole.compact_mode || hole.score >= 0.68,
        human_voice_intensity: if human_active {
            state.human_voice_intensity.load(Ordering::Relaxed)
        } else {
            0
        },
        ai_voice_intensity: if ai_active {
            state.ai_voice_intensity.load(Ordering::Relaxed)
        } else {
            0
        },
        pulsar_stalled: now <= state.stall_until_ms.load(Ordering::Relaxed),
        overlay_consumption: state.overlay_consumption.load(Ordering::Relaxed),
        janitor_heartbeat_active: now <= state.janitor_until_ms.load(Ordering::Relaxed),
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn now_epoch_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn use_surface_projection() -> Signal<SurfaceProjectionState> {
    let mut projection = use_signal(SurfaceProjectionState::default);

    #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
    use_hook(move || {
        ensure_surface_dispatcher();
        spawn(async move {
            loop {
                projection.set(snapshot_surface_projection());
                tokio::time::sleep(Duration::from_millis(SURFACE_REFRESH_MS)).await;
            }
        });
    });

    projection
}
