use crate::vault::QuantumVault;
use dioxus::prelude::*;
use serde::{Deserialize, Serialize};
use std::f32::consts::PI;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::watch;

pub const AMBIENT_CHANNEL: &str = "contextquantum:ambient";
#[cfg(target_arch = "wasm32")]
pub const AMBIENT_EVENT_NAME: &str = "contextquantum:ambient-stream";
pub const AMBIENT_BRIDGE_URL: &str = "ws://contextquantum.local/ambient";
const AMPLITUDE_BINS: usize = 32;
const RING_CAPACITY: usize = 144;
const NORMAL_FRAME_MILLIS: u64 = 14;
const THROTTLED_FRAME_MILLIS: u64 = 17;
const LUT_SIZE: usize = 96;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpectralPayload {
    pub amplitude_vector: [f32; AMPLITUDE_BINS],
    pub orb_pulse_intensity: f32,
    pub fallback_signal: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpectralParams {
    pub session_id: String,
    pub sequence: u64,
    pub timestamp_epoch_ms: u64,
    pub channel: String,
    pub transport_hint: String,
    pub payload: SpectralPayload,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpectralRpcEnvelope {
    pub jsonrpc: String,
    pub method: String,
    pub params: SpectralParams,
}

#[derive(Debug)]
pub struct SpectralBridge {
    ring: AtomicRingBuffer,
    latest_json: watch::Sender<String>,
}

impl SpectralBridge {
    pub fn new() -> Self {
        let (latest_json, _) = watch::channel(String::new());
        Self {
            ring: AtomicRingBuffer::new(RING_CAPACITY),
            latest_json,
        }
    }

    pub fn bridge_url(&self) -> &'static str {
        AMBIENT_BRIDGE_URL
    }

    pub fn subscribe_json(&self) -> watch::Receiver<String> {
        self.latest_json.subscribe()
    }

    pub fn publish(&self, envelope: SpectralRpcEnvelope) {
        let json = serde_json::to_string(&envelope).unwrap_or_else(|_| "{}".to_string());
        self.ring.push(envelope);
        let _ = self.latest_json.send(json.clone());
        dispatch_browser_bridge(&json);
    }
}

impl Default for SpectralBridge {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug)]
struct AtomicRingBuffer {
    slots: Vec<RwLock<Option<SpectralRpcEnvelope>>>,
    write_sequence: AtomicU64,
}

impl AtomicRingBuffer {
    fn new(capacity: usize) -> Self {
        let mut slots = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            slots.push(RwLock::new(None));
        }
        Self {
            slots,
            write_sequence: AtomicU64::new(0),
        }
    }

    fn push(&self, envelope: SpectralRpcEnvelope) -> u64 {
        let sequence = self.write_sequence.fetch_add(1, Ordering::Relaxed) + 1;
        let slot_index = (sequence as usize - 1) % self.slots.len();
        if let Ok(mut slot) = self.slots[slot_index].write() {
            *slot = Some(envelope);
        }
        sequence
    }
}

#[derive(Clone, Debug)]
struct SensoryEmitterControl {
    shutdown: Arc<AtomicBool>,
}

impl SensoryEmitterControl {
    fn new() -> Self {
        Self {
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    fn is_shutdown(&self) -> bool {
        self.shutdown.load(Ordering::Relaxed)
    }
}

impl Drop for SensoryEmitterControl {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

pub fn use_sensory_emitter() {
    let Ok(runtime) = crate::app_runtime() else {
        return;
    };
    let governor = Arc::clone(&runtime.governor);
    let bridge = Arc::clone(&runtime.sensory_bridge);
    let vault = Arc::clone(&runtime.vault);

    let _control = use_hook(move || {
        let control = SensoryEmitterControl::new();
        let task_control = control.clone();
        let task_governor = Arc::clone(&governor);
        let task_bridge = Arc::clone(&bridge);
        let task_vault = Arc::clone(&vault);

        spawn(async move {
            let mut logical_sequence: u64 = 0;
            let mut last_tick_epoch_ms = epoch_millis();

            while !task_control.is_shutdown() {
                let governor_signal = task_governor.governor_signal();
                let now_epoch_ms = epoch_millis();
                let tick_delta = now_epoch_ms.saturating_sub(last_tick_epoch_ms);
                last_tick_epoch_ms = now_epoch_ms;
                logical_sequence = logical_sequence.saturating_add(1);

                let fallback_signal =
                    governor_signal.fallback_signal || tick_delta > THROTTLED_FRAME_MILLIS * 2;
                let amplitude_vector = build_amplitude_vector(logical_sequence, fallback_signal);
                let envelope = SpectralRpcEnvelope {
                    jsonrpc: "2.0".to_string(),
                    method: "ambient.frame".to_string(),
                    params: SpectralParams {
                        session_id: resolve_session_id(&task_vault),
                        sequence: logical_sequence,
                        timestamp_epoch_ms: now_epoch_ms,
                        channel: AMBIENT_CHANNEL.to_string(),
                        transport_hint: task_bridge.bridge_url().to_string(),
                        payload: SpectralPayload {
                            amplitude_vector,
                            orb_pulse_intensity: build_orb_pulse_intensity(
                                logical_sequence,
                                fallback_signal,
                            ),
                            fallback_signal,
                        },
                    },
                };
                task_bridge.publish(envelope);

                let sleep_millis = if governor_signal.throttled {
                    THROTTLED_FRAME_MILLIS
                } else {
                    NORMAL_FRAME_MILLIS
                };
                tokio::time::sleep(Duration::from_millis(sleep_millis)).await;
            }
        });

        control
    });
}

fn build_amplitude_vector(sequence: u64, throttled: bool) -> [f32; AMPLITUDE_BINS] {
    let lut = sine_lut();
    let mut amplitude_vector = [0.0; AMPLITUDE_BINS];
    let stride = if throttled { 5usize } else { 3usize };
    let bias = if throttled { 0.18 } else { 0.42 };
    let gain = if throttled { 0.26 } else { 0.52 };

    for (index, amplitude) in amplitude_vector.iter_mut().enumerate() {
        let lut_index = ((sequence as usize * stride) + index * 2) % LUT_SIZE;
        let wave = lut[lut_index];
        let shaped = if throttled {
            wave.abs()
        } else {
            (wave * 0.5) + 0.5
        };
        *amplitude = (bias + shaped * gain).clamp(0.0, 1.0);
    }

    amplitude_vector
}

fn build_orb_pulse_intensity(sequence: u64, throttled: bool) -> f32 {
    let lut = sine_lut();
    let lut_index = if throttled {
        ((sequence as usize) * 7) % LUT_SIZE
    } else {
        ((sequence as usize) * 4) % LUT_SIZE
    };
    let wave = lut[lut_index];
    let normalized = if throttled { wave.abs() } else { (wave * 0.5) + 0.5 };
    if throttled {
        (0.72 + normalized * 0.22).clamp(0.0, 1.0)
    } else {
        (0.45 + normalized * 0.35).clamp(0.0, 1.0)
    }
}

fn resolve_session_id(vault: &QuantumVault) -> String {
    vault
        .selected_provider()
        .ok()
        .flatten()
        .and_then(|provider| vault.provider_session(provider).ok())
        .map(|record| record.opaque_session_id)
        .unwrap_or_else(|| "mq-session-anonymous".to_string())
}

fn sine_lut() -> &'static [f32; LUT_SIZE] {
    static LUT: OnceLock<[f32; LUT_SIZE]> = OnceLock::new();
    LUT.get_or_init(|| {
        let mut values = [0.0; LUT_SIZE];
        let two_pi = PI * 2.0;
        let step = two_pi / LUT_SIZE as f32;
        let mut index = 0usize;
        while index < LUT_SIZE {
            values[index] = (index as f32 * step).sin();
            index += 1;
        }
        values
    })
}

fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[cfg(target_arch = "wasm32")]
fn dispatch_browser_bridge(json: &str) {
    use wasm_bindgen::JsValue;

    let Some(window) = web_sys::window() else {
        return;
    };

    if let Ok(channel) = web_sys::BroadcastChannel::new(AMBIENT_CHANNEL) {
        let _ = channel.post_message(&JsValue::from_str(json));
    }

    let init = web_sys::CustomEventInit::new();
    init.set_detail(&JsValue::from_str(json));
    if let Ok(event) = web_sys::CustomEvent::new_with_event_init_dict(AMBIENT_EVENT_NAME, &init) {
        let _ = window.dispatch_event(&event);
    }
}

#[cfg(not(target_arch = "wasm32"))]
fn dispatch_browser_bridge(_json: &str) {}



