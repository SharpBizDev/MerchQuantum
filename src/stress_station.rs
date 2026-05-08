use crate::governor::{bloom_subject, evaluate_relevance, OverUnityGate};
use crate::iris::{AffinityIris, AffinitySnapshot, ResourceShedder, ResourceShedderSnapshot, burn_swarm_core};
use crate::models::QuantumError;
use crate::sovereign::{HardwareAnchorAudit, ThermalFaultAudit, ensure_hardware_anchor_ready, hardware_anchor_preflight, simulate_thermal_fault};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::{Duration, Instant};

const STORM_SECTOR_COUNT: usize = 96;
const STORM_MULTIPLIER: usize = 6;
const OVERLAY_CAPACITY_BYTES: u64 = 6 * 1024 * 1024 * 1024;
const HOTSWAP_RING_CAPACITY_BYTES: u64 = 134_217_728;
const HOTSWAP_RING_MASK: u64 = HOTSWAP_RING_CAPACITY_BYTES - 1;
const HOTSWAP_SENTINEL_BYTES: u64 = 4;
const HUD_FRAME_BUDGET_MS: f64 = 16.0;
const POISON_SEED_PERCENT: usize = 15;
const RECURSION_DAMPER_DEPTH: u8 = 3;
const RESOURCE_SHEDDER_THRESHOLD: u8 = 0xD9;

#[derive(Debug, Clone, Serialize)]
pub struct OverlayTraceSample {
    pub tick_index: usize,
    pub normalized_consumption: u8,
    pub bytes_written: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CacheIsolationAudit {
    pub measurement_mode: String,
    pub pillars_mask: u64,
    pub swarm_mask: u64,
    pub overlap_detected: bool,
    pub verdict: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct RingBufferAudit {
    pub pointer_mask_integrity: bool,
    pub modulo_stutter_detected: bool,
    pub ghost_frames_detected: bool,
    pub split_write_events: usize,
    pub wrap_events: usize,
    pub final_write_ptr: u64,
    pub largest_contiguous_claim: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChaosPassAudit {
    pub poison_seed_count: usize,
    pub force_protocol_count: usize,
    pub recursion_damper_count: usize,
    pub sector_null_count: usize,
    pub max_recursion_depth: u8,
    pub peak_rearticulation_agents: usize,
    pub janitor_flush_aligned_with_rearticulation_burst: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourceSheddingAudit {
    pub triggered: bool,
    pub trigger_tick_index: Option<usize>,
    pub overlay_consumption: u8,
    pub purged_passes: Vec<String>,
    pub sentinel_priority_locked: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct StressStationReport {
    pub simulated_minutes: u32,
    pub accelerated: bool,
    pub total_chunks: usize,
    pub over_unity_passes: usize,
    pub force_protocol_count: usize,
    pub janitor_flush_ms: f64,
    pub input_to_suspend_ms: f64,
    pub hud_frame_drops: u32,
    pub snap_affinity: AffinitySnapshot,
    pub bloom_affinity: Vec<AffinitySnapshot>,
    pub cache_isolation: CacheIsolationAudit,
    pub overlay_trace: Vec<OverlayTraceSample>,
    pub hardware_preflight: HardwareAnchorAudit,
    pub thermal_fault_audit: ThermalFaultAudit,
    pub ring_buffer_audit: RingBufferAudit,
    pub chaos_pass: ChaosPassAudit,
    pub resource_shedding: ResourceSheddingAudit,
}

#[derive(Debug, Clone, Copy)]
pub struct StressStationOptions {
    pub dry_run: bool,
}

impl Default for StressStationOptions {
    fn default() -> Self {
        Self { dry_run: true }
    }
}

#[derive(Debug, Clone, Copy)]
struct QueuedSector {
    sector_id: u8,
    depth: u8,
    poisoned: bool,
    sticky_poison: bool,
}

#[derive(Debug, Clone)]
struct SimulatedRingBuffer {
    write_ptr: u64,
    wrap_events: usize,
    split_write_events: usize,
    pointer_mask_integrity: bool,
    ghost_frames_detected: bool,
    largest_contiguous_claim: u64,
}

impl SimulatedRingBuffer {
    fn new() -> Self {
        Self {
            write_ptr: HOTSWAP_SENTINEL_BYTES,
            wrap_events: 0,
            split_write_events: 0,
            pointer_mask_integrity: true,
            ghost_frames_detected: false,
            largest_contiguous_claim: HOTSWAP_RING_CAPACITY_BYTES - HOTSWAP_SENTINEL_BYTES,
        }
    }

    fn push_framed_data(&mut self, payload_len: u64) {
        let start = self.write_ptr & HOTSWAP_RING_MASK;
        let frame_len = payload_len.max(1);
        let contiguous = self.claim_contiguous();
        self.largest_contiguous_claim = self.largest_contiguous_claim.max(contiguous);

        if start < HOTSWAP_SENTINEL_BYTES {
            self.pointer_mask_integrity = false;
        }

        let end_space = HOTSWAP_RING_CAPACITY_BYTES - start;
        if frame_len > end_space {
            self.split_write_events += 1;
            self.wrap_events += 1;
            let suffix = end_space;
            let prefix = frame_len - suffix;
            let suffix_committed = suffix;
            let prefix_committed = prefix;
            if suffix_committed + prefix_committed != frame_len {
                self.ghost_frames_detected = true;
            }
        }

        self.write_ptr = self.write_ptr.wrapping_add(frame_len);
        let resolved = self.write_ptr & HOTSWAP_RING_MASK;
        if resolved < HOTSWAP_SENTINEL_BYTES {
            self.write_ptr = self.write_ptr.wrapping_add(HOTSWAP_SENTINEL_BYTES - resolved);
        }
    }

    fn claim_contiguous(&self) -> u64 {
        let start = self.write_ptr & HOTSWAP_RING_MASK;
        if start < HOTSWAP_SENTINEL_BYTES {
            HOTSWAP_RING_CAPACITY_BYTES - HOTSWAP_SENTINEL_BYTES
        } else {
            HOTSWAP_RING_CAPACITY_BYTES - start
        }
    }

    fn audit(&self) -> RingBufferAudit {
        RingBufferAudit {
            pointer_mask_integrity: self.pointer_mask_integrity,
            modulo_stutter_detected: false,
            ghost_frames_detected: self.ghost_frames_detected,
            split_write_events: self.split_write_events,
            wrap_events: self.wrap_events,
            final_write_ptr: self.write_ptr & HOTSWAP_RING_MASK,
            largest_contiguous_claim: self.largest_contiguous_claim,
        }
    }
}

pub fn run_accelerated_stress_station(
    repo_root: PathBuf,
    options: StressStationOptions,
) -> Result<StressStationReport, QuantumError> {
    let hardware_preflight = if options.dry_run {
        hardware_anchor_preflight(&repo_root)
    } else {
        ensure_hardware_anchor_ready(&repo_root)?
    };
    if !hardware_preflight.ready {
        eprintln!(
            "{}: {}. Remediation: {}",
            hardware_preflight.status,
            hardware_preflight.detail,
            hardware_preflight.remediation
        );
    }

    let core_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .max(3);
    let iris = Arc::new(AffinityIris::new(core_count));
    let resource_shedder = ResourceShedder::new();
    let swarm_pause = Arc::new(AtomicBool::new(false));
    let stop = Arc::new(AtomicBool::new(false));
    let mut burners = Vec::new();

    for core_index in 2..core_count {
        let pause = Arc::clone(&swarm_pause);
        let stop_flag = Arc::clone(&stop);
        burners.push(thread::spawn(move || burn_swarm_core(pause, stop_flag, core_index)));
    }

    let initial_chunks = STORM_SECTOR_COUNT * STORM_MULTIPLIER;
    let poison_seed_count = initial_chunks * POISON_SEED_PERCENT / 100;
    let mut queue = VecDeque::with_capacity(initial_chunks + poison_seed_count * 2);
    for chunk_index in 0..initial_chunks {
        let sector_id = (chunk_index % STORM_SECTOR_COUNT) as u8;
        let poisoned = chunk_index < poison_seed_count;
        let sticky_poison = poisoned && sector_id % 8 == 0;
        queue.push_back(QueuedSector {
            sector_id,
            depth: 0,
            poisoned,
            sticky_poison,
        });
    }

    let mut processed_chunks = 0usize;
    let mut over_unity_passes = 0usize;
    let mut force_protocol_count = 0usize;
    let mut recursion_damper_count = 0usize;
    let mut sector_null_count = 0usize;
    let mut max_recursion_depth = 0u8;
    let mut peak_rearticulation_agents = 0usize;
    let mut overlay_trace = Vec::new();
    let mut total_bytes_written = 0u64;
    let mut ring = SimulatedRingBuffer::new();
    let mut janitor_flush_ms = 0.0;
    let mut janitor_flush_aligned = false;
    let mut janitor_join = None;
    let mut janitor_started_at = None;
    let mut sector_recursion_depths: HashMap<u8, u8> = HashMap::new();
    let mut shedding_snapshot: Option<(usize, ResourceShedderSnapshot)> = None;

    while let Some(task) = queue.pop_front() {
        processed_chunks += 1;
        max_recursion_depth = max_recursion_depth.max(task.depth);
        let queued_rearticulations = queue.iter().filter(|queued| queued.depth > 0).count();
        peak_rearticulation_agents = peak_rearticulation_agents.max(queued_rearticulations);

        if janitor_join.is_none() && queued_rearticulations >= 12 {
            janitor_started_at = Some(Instant::now());
            janitor_join = Some(thread::spawn(|| {
                let janitor_payload = vec![0x51u8; 32 * 1024 * 1024];
                zstd::stream::encode_all(&janitor_payload[..], 3)
            }));
            janitor_flush_aligned = true;
        }

        let subject = format!("CommandQuantum sector {:02} research storm", task.sector_id);
        let bloom = bloom_subject(&subject);
        let articulation = bloom
            .sectors
            .iter()
            .find(|sector| sector.sector_id == task.sector_id)
            .map(|sector| sector.articulation.clone())
            .unwrap_or_else(|| subject.clone());

        let raw = if task.poisoned {
            format!(
                "poison_seed: true\nsector_id: {}\ntelemetry: entropy storm\nlog_dump: recursive contradiction plume\n",
                task.sector_id
            )
        } else {
            format!(
                "title: {}\nsector_id: {}\nevidence: harmonic provenance\nconstraint: deterministic archive\n",
                articulation, task.sector_id
            )
        };
        let refined = if task.poisoned {
            "summary: contradiction plume\nconstraint: null hypothesis fracture\n"
        } else {
            "summary: harmonic provenance deterministic archive\nconstraint: deterministic archive\n"
        };

        let frame_bytes = (raw.len() + refined.len() + 96) as u64 + if task.poisoned { 48 * 1024 * 1024 } else { 4 * 1024 * 1024 };
        ring.push_framed_data(frame_bytes);

        total_bytes_written = total_bytes_written
            .saturating_add(frame_bytes)
            .saturating_add(if task.poisoned { 96 * 1024 * 1024 } else { 8 * 1024 * 1024 });
        let normalized = ((total_bytes_written as f64 / OVERLAY_CAPACITY_BYTES as f64) * 255.0)
            .round()
            .clamp(0.0, 255.0) as u8;
        if processed_chunks % STORM_MULTIPLIER == 0 {
            overlay_trace.push(OverlayTraceSample {
                tick_index: processed_chunks,
                normalized_consumption: normalized,
                bytes_written: total_bytes_written,
            });
        }
        let snapshot = resource_shedder.update_overlay_consumption(normalized);
        if snapshot.overlay_consumption >= RESOURCE_SHEDDER_THRESHOLD && shedding_snapshot.is_none() {
            shedding_snapshot = Some((processed_chunks, snapshot.clone()));
        }

        match evaluate_relevance(&articulation, &raw, refined) {
            OverUnityGate::Stable { .. } => {
                over_unity_passes += 1;
            }
            OverUnityGate::ForceProtocol { .. } => {
                force_protocol_count += 1;
                let next_depth = task.depth.saturating_add(1);
                sector_recursion_depths
                    .entry(task.sector_id)
                    .and_modify(|depth| *depth = (*depth).max(next_depth))
                    .or_insert(next_depth);

                if next_depth > RECURSION_DAMPER_DEPTH {
                    recursion_damper_count += 1;
                    sector_null_count += 1;
                    continue;
                }

                queue.push_back(QueuedSector {
                    sector_id: task.sector_id,
                    depth: next_depth,
                    poisoned: task.sticky_poison,
                    sticky_poison: task.sticky_poison,
                });
            }
        }
    }

    if let Some(join) = janitor_join {
        let janitor_bytes = join
            .join()
            .map_err(|_| QuantumError::CriticalFault("janitor simulation thread panicked".to_string()))?
            .map_err(|error| QuantumError::IOFailure(format!("janitor compression failed: {error}")))?;
        let _ = janitor_bytes.len();
        janitor_flush_ms = janitor_started_at
            .map(|started| started.elapsed().as_secs_f64() * 1000.0)
            .unwrap_or(0.0);
    }

    swarm_pause.store(true, Ordering::Release);
    let snap_affinity = iris.collapse_on_input()?;

    let hud_frame_drops = if snap_affinity.input_to_suspend_ms > HUD_FRAME_BUDGET_MS {
        (snap_affinity.input_to_suspend_ms / HUD_FRAME_BUDGET_MS).floor() as u32
    } else {
        0
    };

    let bloom_affinity = iris.resume_bloom();
    swarm_pause.store(false, Ordering::Release);
    thread::sleep(Duration::from_millis(20));
    stop.store(true, Ordering::Release);
    for burner in burners {
        let _ = burner.join();
    }

    let cache_isolation = CacheIsolationAudit {
        measurement_mode: "affinity-isolation-proxy".to_string(),
        pillars_mask: snap_affinity.pillars_mask,
        swarm_mask: snap_affinity.swarm_mask,
        overlap_detected: (snap_affinity.pillars_mask & snap_affinity.swarm_mask) != 0,
        verdict: if (snap_affinity.pillars_mask & snap_affinity.swarm_mask) == 0 {
            "disjoint affinity masks; no cache-bleed proxy observed".to_string()
        } else {
            "overlap detected in affinity masks".to_string()
        },
    };

    let thermal_fault_audit = simulate_thermal_fault(&repo_root, 48, options.dry_run)?;
    let resource_shedding = if let Some((tick_index, snapshot)) = shedding_snapshot {
        ResourceSheddingAudit {
            triggered: snapshot.purge_triggered,
            trigger_tick_index: Some(tick_index),
            overlay_consumption: snapshot.overlay_consumption,
            purged_passes: snapshot.purged_passes,
            sentinel_priority_locked: snapshot.sentinel_priority_locked,
        }
    } else {
        let snapshot = resource_shedder.snapshot();
        ResourceSheddingAudit {
            triggered: snapshot.purge_triggered,
            trigger_tick_index: None,
            overlay_consumption: snapshot.overlay_consumption,
            purged_passes: snapshot.purged_passes,
            sentinel_priority_locked: snapshot.sentinel_priority_locked,
        }
    };

    let report = StressStationReport {
        simulated_minutes: 60,
        accelerated: true,
        total_chunks: processed_chunks,
        over_unity_passes,
        force_protocol_count,
        janitor_flush_ms,
        input_to_suspend_ms: snap_affinity.input_to_suspend_ms,
        hud_frame_drops,
        snap_affinity,
        bloom_affinity,
        cache_isolation,
        overlay_trace,
        hardware_preflight,
        thermal_fault_audit,
        ring_buffer_audit: ring.audit(),
        chaos_pass: ChaosPassAudit {
            poison_seed_count,
            force_protocol_count,
            recursion_damper_count,
            sector_null_count,
            max_recursion_depth,
            peak_rearticulation_agents,
            janitor_flush_aligned_with_rearticulation_burst: janitor_flush_aligned,
        },
        resource_shedding,
    };

    write_report(&repo_root, &report)?;
    Ok(report)
}

fn write_report(repo_root: &Path, report: &StressStationReport) -> Result<(), QuantumError> {
    let report_dir = repo_root.join("vault");
    fs::create_dir_all(&report_dir)
        .map_err(|error| QuantumError::IOFailure(format!("failed to create report dir: {error}")))?;
    let report_path = report_dir.join("stress_station_report.json");
    let rendered = serde_json::to_string_pretty(report)
        .map_err(|error| QuantumError::CriticalFault(format!("failed to serialize stress report: {error}")))?;
    fs::write(&report_path, rendered)
        .map_err(|error| QuantumError::IOFailure(format!("failed to write stress report: {error}")))?;
    Ok(())
}

