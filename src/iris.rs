use crate::models::QuantumError;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::hint::black_box;
use std::sync::atomic::{AtomicBool, AtomicU8, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::Instant;
use windows_sys::Win32::Foundation::{CloseHandle, HANDLE, LPARAM, LRESULT, WPARAM};
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Threading::{
    GetCurrentThread, GetCurrentThreadId, OpenProcess, OpenThread,
    ResumeThread, SetThreadAffinityMask, SuspendThread, PROCESS_QUERY_LIMITED_INFORMATION,
    THREAD_SUSPEND_RESUME,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetMessageW, PostThreadMessageW, SetWindowsHookExW,
    TranslateMessage, UnhookWindowsHookEx, HHOOK, MSG, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_QUIT,
};

const PROCESS_SUSPEND_RESUME: u32 = 0x0800;
const SNAP_AGENT_COUNT: usize = 3;
const PILLAR_CORE_COUNT: usize = 2;
static INPUT_CALLBACK: OnceLock<Arc<dyn Fn(InputEventKind) + Send + Sync>> = OnceLock::new();
static LIVE_IRIS: OnceLock<Arc<LiveIrisController>> = OnceLock::new();

#[link(name = "ntdll")]
unsafe extern "system" {
    fn NtSuspendProcess(process_handle: HANDLE) -> i32;
    fn NtResumeProcess(process_handle: HANDLE) -> i32;
}

#[derive(Debug, Clone, Copy, Serialize)]
pub enum InputEventKind {
    Keyboard,
    Mouse,
}

#[derive(Debug, Clone, Serialize)]
pub struct CoreHeatCell {
    pub core_index: usize,
    pub role: String,
    pub load_ratio: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct AffinitySnapshot {
    pub phase: String,
    pub active_agent_count: usize,
    pub pillars_mask: u64,
    pub swarm_mask: u64,
    pub input_to_suspend_ms: f64,
    pub heatmap: Vec<CoreHeatCell>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourceShedderSnapshot {
    pub overlay_consumption: u8,
    pub purge_triggered: bool,
    pub purged_passes: Vec<String>,
    pub sentinel_priority_locked: bool,
}

pub struct AffinityIris {
    core_count: usize,
    base_agents: usize,
    active_agents: AtomicUsize,
    swarm_paused: AtomicBool,
}

pub struct LowLevelRawInputHook {
    thread_id: Arc<AtomicUsize>,
    join: Option<JoinHandle<()>>,
}

pub struct ResourceShedder {
    overlay_consumption: AtomicU8,
    purge_triggered: AtomicBool,
}

pub struct LiveIrisController {
    affinity: AffinityIris,
    swarm_threads: Mutex<HashMap<u32, String>>,
    swarm_processes: Mutex<HashSet<u32>>,
    collapse_latch: AtomicBool,
    llrih: Mutex<Option<LowLevelRawInputHook>>,
}

impl Drop for LowLevelRawInputHook {
    fn drop(&mut self) {
        let thread_id = self.thread_id.load(Ordering::Acquire) as u32;
        if thread_id != 0 {
            unsafe {
                PostThreadMessageW(thread_id, WM_QUIT, 0, 0);
            }
        }
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

impl AffinityIris {
    pub fn new(core_count: usize) -> Self {
        let normalized_cores = core_count.max(PILLAR_CORE_COUNT + 1);
        Self {
            core_count: normalized_cores,
            base_agents: 96,
            active_agents: AtomicUsize::new(96),
            swarm_paused: AtomicBool::new(false),
        }
    }

    pub fn core_count(&self) -> usize {
        self.core_count
    }

    pub fn active_agents(&self) -> usize {
        self.active_agents.load(Ordering::Acquire)
    }

    pub fn is_swarm_paused(&self) -> bool {
        self.swarm_paused.load(Ordering::Acquire)
    }

    pub fn pillars_mask(&self) -> u64 {
        mask_for_range(0, self.core_count.min(PILLAR_CORE_COUNT))
    }

    pub fn swarm_mask(&self) -> u64 {
        if self.core_count <= PILLAR_CORE_COUNT {
            self.pillars_mask()
        } else {
            mask_for_range(PILLAR_CORE_COUNT, self.core_count)
        }
    }

    pub fn harmonic_agent_budget(&self, bloom_step: u8) -> usize {
        let divisor = 1usize << bloom_step.min(5);
        (self.base_agents / divisor).max(SNAP_AGENT_COUNT)
    }

    pub fn bloom_schedule(&self) -> Vec<AffinitySnapshot> {
        let mut snapshots = Vec::new();
        for step in (0..=5).rev() {
            let active_agent_count = self.harmonic_agent_budget(step);
            snapshots.push(self.snapshot("Bloom", active_agent_count, 0.0));
        }
        snapshots
    }

    pub fn collapse_on_input(&self) -> Result<AffinitySnapshot, QuantumError> {
        let start = Instant::now();
        self.swarm_paused.store(true, Ordering::Release);
        self.active_agents.store(SNAP_AGENT_COUNT, Ordering::Release);
        let elapsed = start.elapsed().as_secs_f64() * 1000.0;
        Ok(self.snapshot("Snap", SNAP_AGENT_COUNT, elapsed))
    }

    pub fn resume_bloom(&self) -> Vec<AffinitySnapshot> {
        self.swarm_paused.store(false, Ordering::Release);
        let snapshots = self.bloom_schedule();
        if let Some(last) = snapshots.last() {
            self.active_agents
                .store(last.active_agent_count, Ordering::Release);
        }
        snapshots
    }

    pub fn snapshot(&self, phase: &str, active_agent_count: usize, input_to_suspend_ms: f64) -> AffinitySnapshot {
        let pillars_mask = self.pillars_mask();
        let swarm_mask = self.swarm_mask();
        let mut heatmap = Vec::with_capacity(self.core_count);
        let swarm_cores = self.core_count.saturating_sub(PILLAR_CORE_COUNT).max(1);
        let pillar_load = if phase == "Snap" { 1.0 } else { 0.35 };
        let swarm_load = ((active_agent_count as f32) / (self.base_agents as f32)).clamp(0.0, 1.0);

        for core_index in 0..self.core_count {
            let (role, load_ratio) = if core_index < PILLAR_CORE_COUNT {
                ("Pillar", pillar_load)
            } else {
                (
                    "Swarm",
                    if phase == "Snap" {
                        0.0
                    } else {
                        (swarm_load / swarm_cores as f32).clamp(0.0, 1.0)
                    },
                )
            };
            heatmap.push(CoreHeatCell {
                core_index,
                role: role.to_string(),
                load_ratio,
            });
        }

        AffinitySnapshot {
            phase: phase.to_string(),
            active_agent_count,
            pillars_mask,
            swarm_mask,
            input_to_suspend_ms,
            heatmap,
        }
    }
}

impl ResourceShedder {
    pub fn new() -> Self {
        Self {
            overlay_consumption: AtomicU8::new(0),
            purge_triggered: AtomicBool::new(false),
        }
    }

    pub fn update_overlay_consumption(&self, overlay_consumption: u8) -> ResourceShedderSnapshot {
        self.overlay_consumption
            .store(overlay_consumption, Ordering::Release);
        if overlay_consumption >= 0xD9 {
            self.purge_triggered.store(true, Ordering::Release);
        }
        self.snapshot()
    }

    pub fn snapshot(&self) -> ResourceShedderSnapshot {
        let overlay_consumption = self.overlay_consumption.load(Ordering::Acquire);
        let purge_triggered = self.purge_triggered.load(Ordering::Acquire);
        let purged_passes = if purge_triggered {
            vec![
                "spectral_tears".to_string(),
                "ghost_shimmer".to_string(),
                "refractive_bleed".to_string(),
            ]
        } else {
            Vec::new()
        };

        ResourceShedderSnapshot {
            overlay_consumption,
            purge_triggered,
            purged_passes,
            sentinel_priority_locked: purge_triggered,
        }
    }
}

impl LiveIrisController {
    fn new(core_count: usize) -> Self {
        Self {
            affinity: AffinityIris::new(core_count),
            swarm_threads: Mutex::new(HashMap::new()),
            swarm_processes: Mutex::new(HashSet::new()),
            collapse_latch: AtomicBool::new(false),
            llrih: Mutex::new(None),
        }
    }

    fn install_hook(self: &Arc<Self>) -> Result<(), QuantumError> {
        let mut slot = self
            .llrih
            .lock()
            .map_err(|_| QuantumError::CriticalFault("live iris hook lock poisoned".to_string()))?;
        if slot.is_some() {
            return Ok(());
        }
        let controller = Arc::clone(self);
        let hook = install_llrih(move |_| {
            let _ = controller.collapse_swarm_now();
        })?;
        *slot = Some(hook);
        Ok(())
    }

    pub fn register_current_swarm_thread(&self, label: &str) -> Result<(), QuantumError> {
        bind_current_thread_to_mask(self.affinity.swarm_mask())?;
        let thread_id = unsafe { GetCurrentThreadId() };
        let mut registry = self
            .swarm_threads
            .lock()
            .map_err(|_| QuantumError::CriticalFault("swarm thread registry lock poisoned".to_string()))?;
        registry.insert(thread_id, label.to_string());
        Ok(())
    }

    pub fn register_swarm_process_pid(&self, pid: u32) -> Result<(), QuantumError> {
        let mut registry = self
            .swarm_processes
            .lock()
            .map_err(|_| QuantumError::CriticalFault("swarm process registry lock poisoned".to_string()))?;
        registry.insert(pid);
        Ok(())
    }

    pub fn collapse_swarm_now(&self) -> Result<AffinitySnapshot, QuantumError> {
        if self.collapse_latch.swap(true, Ordering::AcqRel) {
            return Ok(self.affinity.snapshot("Snap", SNAP_AGENT_COUNT, 0.0));
        }

        let started = Instant::now();
        self.affinity.swarm_paused.store(true, Ordering::Release);
        self.affinity.active_agents.store(SNAP_AGENT_COUNT, Ordering::Release);

        let current_thread_id = unsafe { GetCurrentThreadId() };
        if let Ok(registry) = self.swarm_threads.lock() {
            for thread_id in registry.keys().copied() {
                if thread_id != current_thread_id {
                    let _ = suspend_thread(thread_id);
                }
            }
        }

        if let Ok(registry) = self.swarm_processes.lock() {
            for pid in registry.iter().copied() {
                let _ = suspend_process(pid);
            }
        }

        Ok(self
            .affinity
            .snapshot("Snap", SNAP_AGENT_COUNT, started.elapsed().as_secs_f64() * 1000.0))
    }

    pub fn release_swarm_for_bloom(&self) -> Result<Vec<AffinitySnapshot>, QuantumError> {
        if let Ok(registry) = self.swarm_threads.lock() {
            for thread_id in registry.keys().copied() {
                let _ = resume_thread(thread_id);
            }
        }
        if let Ok(registry) = self.swarm_processes.lock() {
            for pid in registry.iter().copied() {
                let _ = resume_process(pid);
            }
        }
        self.collapse_latch.store(false, Ordering::Release);
        Ok(self.affinity.resume_bloom())
    }

    pub fn pillars_mask(&self) -> u64 {
        self.affinity.pillars_mask()
    }

    pub fn swarm_mask(&self) -> u64 {
        self.affinity.swarm_mask()
    }
}

pub fn ignite_live_iris(core_count: usize) -> Result<Arc<LiveIrisController>, QuantumError> {
    if let Some(controller) = LIVE_IRIS.get() {
        return Ok(controller.clone());
    }

    let controller = Arc::new(LiveIrisController::new(core_count));
    controller.install_hook()?;
    let _ = LIVE_IRIS.set(controller.clone());
    Ok(controller)
}

pub fn live_iris() -> Option<Arc<LiveIrisController>> {
    LIVE_IRIS.get().cloned()
}

pub fn pillars_affinity_mask() -> u64 {
    live_iris()
        .map(|controller| controller.pillars_mask())
        .unwrap_or_else(default_pillars_mask)
}

pub fn swarm_affinity_mask() -> u64 {
    live_iris()
        .map(|controller| controller.swarm_mask())
        .unwrap_or_else(default_swarm_mask)
}

pub fn register_swarm_thread_current(label: &str) -> Result<(), QuantumError> {
    if let Some(controller) = live_iris() {
        controller.register_current_swarm_thread(label)
    } else {
        bind_current_thread_to_mask(default_swarm_mask())
    }
}

pub fn register_swarm_process_pid(pid: u32) -> Result<(), QuantumError> {
    if let Some(controller) = live_iris() {
        controller.register_swarm_process_pid(pid)
    } else {
        Err(QuantumError::CriticalFault(
            "live iris controller unavailable while registering swarm process pid".to_string(),
        ))
    }
}

pub fn register_pillar_thread_current(core_index: usize) -> Result<(), QuantumError> {
    let core = core_index.min(PILLAR_CORE_COUNT.saturating_sub(1));
    bind_current_thread_to_core(core)
}

pub fn bind_current_thread_to_mask(mask: u64) -> Result<(), QuantumError> {
    unsafe {
        let thread = GetCurrentThread();
        let previous = SetThreadAffinityMask(thread, mask as usize);
        if previous == 0 {
            return Err(QuantumError::CriticalFault(
                "failed to set current thread affinity mask".to_string(),
            ));
        }
    }
    Ok(())
}

pub fn bind_current_thread_to_core(core_index: usize) -> Result<(), QuantumError> {
    if core_index >= 64 {
        return Err(QuantumError::CriticalFault(format!(
            "core index {} exceeds affinity mask width",
            core_index
        )));
    }
    bind_current_thread_to_mask(1u64 << core_index)
}

pub fn suspend_process(pid: u32) -> Result<(), QuantumError> {
    let handle = open_suspend_handle(pid)?;
    let status = unsafe { NtSuspendProcess(handle) };
    unsafe {
        CloseHandle(handle);
    }
    if status < 0 {
        return Err(QuantumError::CriticalFault(format!(
            "NtSuspendProcess failed for pid {} with status {}",
            pid, status
        )));
    }
    Ok(())
}

pub fn resume_process(pid: u32) -> Result<(), QuantumError> {
    let handle = open_suspend_handle(pid)?;
    let status = unsafe { NtResumeProcess(handle) };
    unsafe {
        CloseHandle(handle);
    }
    if status < 0 {
        return Err(QuantumError::CriticalFault(format!(
            "NtResumeProcess failed for pid {} with status {}",
            pid, status
        )));
    }
    Ok(())
}

pub fn install_llrih<F>(on_input: F) -> Result<LowLevelRawInputHook, QuantumError>
where
    F: Fn(InputEventKind) + Send + Sync + 'static,
{
    let callback: Arc<dyn Fn(InputEventKind) + Send + Sync> = Arc::new(on_input);
    let _ = INPUT_CALLBACK.set(callback);
    let thread_id = Arc::new(AtomicUsize::new(0));
    let thread_id_clone = Arc::clone(&thread_id);

    let join = thread::Builder::new()
        .name("quantum-llrih".to_string())
        .spawn(move || unsafe {
            let _ = bind_current_thread_to_core(1);
            thread_id_clone.store(GetCurrentThreadId() as usize, Ordering::Release);
            let instance = GetModuleHandleW(std::ptr::null());
            let keyboard_hook = SetWindowsHookExW(WH_KEYBOARD_LL, Some(low_level_keyboard_proc), instance, 0);
            let mouse_hook = SetWindowsHookExW(WH_MOUSE_LL, Some(low_level_mouse_proc), instance, 0);

            let mut message = std::mem::zeroed::<MSG>();
            while GetMessageW(&mut message, std::ptr::null_mut(), 0, 0) > 0 {
                TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            if !keyboard_hook.is_null() {
                UnhookWindowsHookEx(keyboard_hook);
            }
            if !mouse_hook.is_null() {
                UnhookWindowsHookEx(mouse_hook);
            }
        })
        .map_err(|error| QuantumError::CriticalFault(format!("failed to spawn LLRIH thread: {error}")))?;

    Ok(LowLevelRawInputHook {
        thread_id,
        join: Some(join),
    })
}

pub fn burn_swarm_core(pause: Arc<AtomicBool>, stop: Arc<AtomicBool>, core_index: usize) {
    let _ = bind_current_thread_to_core(core_index);
    let mut accumulator = 0u64;
    while !stop.load(Ordering::Acquire) {
        if pause.load(Ordering::Acquire) {
            std::hint::spin_loop();
            continue;
        }
        accumulator = accumulator.wrapping_add(1);
        black_box(accumulator.rotate_left((core_index % 31) as u32));
    }
}

fn default_pillars_mask() -> u64 {
    mask_for_range(0, PILLAR_CORE_COUNT)
}

fn default_swarm_mask() -> u64 {
    let core_count = std::thread::available_parallelism()
        .map(|count| count.get())
        .unwrap_or(4)
        .max(PILLAR_CORE_COUNT + 1);
    mask_for_range(PILLAR_CORE_COUNT, core_count)
}

fn mask_for_range(start: usize, end: usize) -> u64 {
    let mut mask = 0u64;
    for core_index in start..end.min(64) {
        mask |= 1u64 << core_index;
    }
    mask
}

fn open_suspend_handle(pid: u32) -> Result<HANDLE, QuantumError> {
    unsafe {
        let handle = OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_SUSPEND_RESUME,
            0,
            pid,
        );
        if handle.is_null() {
            return Err(QuantumError::CriticalFault(format!(
                "failed to open process {} for suspend/resume",
                pid
            )));
        }
        Ok(handle)
    }
}

fn suspend_thread(thread_id: u32) -> Result<(), QuantumError> {
    unsafe {
        let handle = OpenThread(THREAD_SUSPEND_RESUME, 0, thread_id);
        if handle.is_null() {
            return Err(QuantumError::CriticalFault(format!(
                "failed to open thread {} for suspend",
                thread_id
            )));
        }
        let result = SuspendThread(handle);
        CloseHandle(handle);
        if result == u32::MAX {
            return Err(QuantumError::CriticalFault(format!(
                "SuspendThread failed for {}",
                thread_id
            )));
        }
    }
    Ok(())
}

fn resume_thread(thread_id: u32) -> Result<(), QuantumError> {
    unsafe {
        let handle = OpenThread(THREAD_SUSPEND_RESUME, 0, thread_id);
        if handle.is_null() {
            return Err(QuantumError::CriticalFault(format!(
                "failed to open thread {} for resume",
                thread_id
            )));
        }
        let result = ResumeThread(handle);
        CloseHandle(handle);
        if result == u32::MAX {
            return Err(QuantumError::CriticalFault(format!(
                "ResumeThread failed for {}",
                thread_id
            )));
        }
    }
    Ok(())
}

unsafe extern "system" fn low_level_keyboard_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        if let Some(callback) = INPUT_CALLBACK.get() {
            callback(InputEventKind::Keyboard);
        }
    }
    unsafe { CallNextHookEx(0 as HHOOK, code, wparam, lparam) }
}

unsafe extern "system" fn low_level_mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        if let Some(callback) = INPUT_CALLBACK.get() {
            callback(InputEventKind::Mouse);
        }
    }
    unsafe { CallNextHookEx(0 as HHOOK, code, wparam, lparam) }
}

pub fn current_pid() -> u32 {
    std::process::id()
}


