#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::metadata;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use crate::APP_RUNTIME;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::desktop::{wry::http::{header::CONTENT_TYPE, Response as HttpResponse, StatusCode}, Config, DesktopContext, RequestAsyncResponder, WindowBuilder};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::prelude::*;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use serde::Serialize;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use serde_json::json;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::borrow::Cow;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::sync::{Arc, OnceLock, RwLock};
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::thread;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use std::time::Duration;

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const NATIVE_LOOPBACK_ORIGIN: &str = "https://127.0.0.1:38443";
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const NATIVE_BRIDGE_EVENT: &str = "contextquantum:native-bridge";
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
const HOLE_SCORE_EVENT: &str = "contextquantum:hole-score";

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Debug, Clone, Serialize)]
pub struct HoleScore {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub score: f32,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Debug, Clone, Serialize)]
pub struct NativeBridgeDescriptor {
    pub label: &'static str,
    pub source: &'static str,
    pub loopback_origin: &'static str,
    pub custom_protocol: &'static str,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static BEST_HOLE: OnceLock<Arc<RwLock<HoleScore>>> = OnceLock::new();
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
static HOLE_SCORER_STARTED: AtomicBool = AtomicBool::new(false);

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn best_hole_store() -> Arc<RwLock<HoleScore>> {
    BEST_HOLE
        .get_or_init(|| {
            Arc::new(RwLock::new(HoleScore {
                x: 1180,
                y: 120,
                width: 420,
                height: 720,
                score: 0.72,
            }))
        })
        .clone()
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn current_hole_score() -> HoleScore {
    best_hole_store()
        .read()
        .map(|entry| entry.clone())
        .unwrap_or(HoleScore {
            x: 1180,
            y: 120,
            width: 420,
            height: 720,
            score: 0.72,
        })
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn native_bridge_descriptor() -> NativeBridgeDescriptor {
    NativeBridgeDescriptor {
        label: "Native (SAB Enabled)",
        source: "native-sab-bridge",
        loopback_origin: NATIVE_LOOPBACK_ORIGIN,
        custom_protocol: "contextquantum://bridge/status.json",
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn desktop_config() -> Config {
    Config::new()
        .with_window(
            WindowBuilder::new()
                .with_title("ContextQuantum")
                .with_transparent(true)
                .with_decorations(false)
                .with_always_on_top(true),
        )
        .with_asynchronous_custom_protocol("contextquantum", |request, responder| {
            respond_native_protocol(request.uri().path().to_string(), responder);
        })
        .with_custom_head(native_head())
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn native_head() -> String {
    let descriptor = serde_json::to_string(&native_bridge_descriptor()).unwrap_or_else(|_| "{}".to_string());
    format!(
        r#"<meta http-equiv=\"Cross-Origin-Opener-Policy\" content=\"same-origin\" />
<meta http-equiv=\"Cross-Origin-Embedder-Policy\" content=\"require-corp\" />
<script>
window.__CONTEXT_QUANTUM_NATIVE__ = {descriptor};
window.dispatchEvent(new CustomEvent('{bridge_event}', {{ detail: window.__CONTEXT_QUANTUM_NATIVE__ }}));
</script>"#,
        descriptor = descriptor,
        bridge_event = NATIVE_BRIDGE_EVENT,
    )
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn respond_native_protocol(path: String, responder: RequestAsyncResponder) {
    tokio::spawn(async move {
        let body = match path.as_str() {
            "/bridge/status.json" => serde_json::to_vec(&native_bridge_descriptor()).unwrap_or_default(),
            "/bridge/bulk.json" => {
                let ambient = APP_RUNTIME
                    .get()
                    .map(|runtime| runtime.sensory_bridge.subscribe_json().borrow().clone())
                    .unwrap_or_default();
                serde_json::to_vec(&json!({
                    "bridge": native_bridge_descriptor(),
                    "hole": current_hole_score(),
                    "ambient": ambient,
                }))
                .unwrap_or_default()
            }
            "/metadata/schema.json" => serde_json::to_vec(&json!({
                "request": metadata::structured_metadata_request("{}"),
                "schema": metadata::structured_metadata_schema(),
                "redacted_example": metadata::redact_egress(&json!({
                    "asset_id": "hidden",
                    "asset_name": "hidden",
                    "canonical_title": "Context Quantum Asset",
                    "tags": ["refinery", "spectral"],
                    "confidence": 0.88
                }))
            }))
            .unwrap_or_default(),
            _ => Vec::new(),
        };

        let status = if body.is_empty() { StatusCode::NOT_FOUND } else { StatusCode::OK };
        responder.respond(
            HttpResponse::builder()
                .status(status)
                .header(CONTENT_TYPE, "application/json")
                .body(Cow::Owned(body))
                .unwrap(),
        );
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
pub fn use_native_shell_bridge(desktop: DesktopContext) {
    use_hook(move || {
        configure_haunted_overlay(&desktop);
        ensure_hole_scorer();

        let shutdown = Arc::new(AtomicBool::new(false));
        let shutdown_task = shutdown.clone();

        spawn(async move {
            while !shutdown_task.load(Ordering::Relaxed) {
                let hole = serde_json::to_string(&current_hole_score()).unwrap_or_else(|_| "{}".to_string());
                let bridge = serde_json::to_string(&native_bridge_descriptor()).unwrap_or_else(|_| "{}".to_string());
                let script = format!(
                    "window.dispatchEvent(new CustomEvent('{hole_event}', {{ detail: {hole} }}));window.dispatchEvent(new CustomEvent('{bridge_event}', {{ detail: {bridge} }}));",
                    hole_event = HOLE_SCORE_EVENT,
                    bridge_event = NATIVE_BRIDGE_EVENT,
                    hole = hole,
                    bridge = bridge,
                );
                let _ = document::eval(&script).await;
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
        });

        NativeShellHandle { shutdown }
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
#[derive(Clone)]
struct NativeShellHandle {
    shutdown: Arc<AtomicBool>,
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
impl Drop for NativeShellHandle {
    fn drop(&mut self) {
        self.shutdown.store(true, Ordering::Relaxed);
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn ensure_hole_scorer() {
    if HOLE_SCORER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    let store = best_hole_store();
    thread::spawn(move || loop {
        if let Ok(mut slot) = store.write() {
            *slot = compute_best_hole();
        }
        thread::sleep(Duration::from_millis(100));
    });
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn compute_best_hole() -> HoleScore {
    #[cfg(target_os = "windows")]
    {
        windows::compute_best_hole_windows()
    }
    #[cfg(not(target_os = "windows"))]
    {
        HoleScore { x: 1180, y: 120, width: 420, height: 720, score: 0.72 }
    }
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
fn configure_haunted_overlay(desktop: &DesktopContext) {
    #[cfg(target_os = "windows")]
    windows::configure_haunted_overlay_windows(desktop);
}

#[cfg(all(feature = "desktop", not(target_arch = "wasm32"), target_os = "windows"))]
mod windows {
    use super::{DesktopContext, HoleScore};
    use dioxus::desktop::tao::platform::windows::WindowExtWindows;
    use std::ffi::c_void;
    use std::mem::size_of;

    type Bool = i32;
    type Hwnd = *mut c_void;
    type Lparam = isize;

    const GWL_EXSTYLE: i32 = -20;
    const WS_EX_NOACTIVATE: isize = 0x08000000;
    const SPI_GETWORKAREA: u32 = 0x0030;
    const DWMWA_CLOAKED: u32 = 14;
    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_NOACTIVATE: u32 = 0x0010;
    const SWP_SHOWWINDOW: u32 = 0x0040;

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Rect {
        left: i32,
        top: i32,
        right: i32,
        bottom: i32,
    }

    extern "system" {
        fn EnumWindows(callback: Option<unsafe extern "system" fn(Hwnd, Lparam) -> Bool>, lparam: Lparam) -> Bool;
        fn GetWindowRect(hwnd: Hwnd, rect: *mut Rect) -> Bool;
        fn IsWindowVisible(hwnd: Hwnd) -> Bool;
        fn GetWindowLongPtrW(hwnd: Hwnd, index: i32) -> isize;
        fn SetWindowLongPtrW(hwnd: Hwnd, index: i32, value: isize) -> isize;
        fn SetWindowPos(hwnd: Hwnd, insert_after: Hwnd, x: i32, y: i32, cx: i32, cy: i32, flags: u32) -> Bool;
        fn SystemParametersInfoW(action: u32, param: u32, out: *mut c_void, update: u32) -> Bool;
        fn DwmGetWindowAttribute(hwnd: Hwnd, attribute: u32, value: *mut c_void, size: u32) -> i32;
    }

    pub fn configure_haunted_overlay_windows(desktop: &DesktopContext) {
        unsafe {
            let hwnd = desktop.window.hwnd() as Hwnd;
            if hwnd.is_null() {
                return;
            }
            let current = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
            let _ = SetWindowLongPtrW(hwnd, GWL_EXSTYLE, current | WS_EX_NOACTIVATE);
            let topmost = (-1isize) as Hwnd;
            let _ = SetWindowPos(hwnd, topmost, 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }
    }

    pub fn compute_best_hole_windows() -> HoleScore {
        unsafe {
            let mut work_area = Rect::default();
            let _ = SystemParametersInfoW(SPI_GETWORKAREA, 0, &mut work_area as *mut _ as *mut c_void, 0);
            let work_width = (work_area.right - work_area.left).max(320);
            let work_height = (work_area.bottom - work_area.top).max(320);
            let target_width = (work_width / 4).clamp(320, 560);
            let target_height = (work_height / 2).clamp(360, 760);
            let candidate_positions = [
                (work_area.right - target_width - 24, work_area.top + 24),
                (work_area.right - target_width - 24, work_area.bottom - target_height - 24),
                (work_area.left + 24, work_area.top + 24),
                (work_area.left + 24, work_area.bottom - target_height - 24),
            ];

            let mut windows = Vec::<Rect>::new();
            let windows_ptr = &mut windows as *mut Vec<Rect> as isize;
            let _ = EnumWindows(Some(enum_visible_windows), windows_ptr);

            let mut best = HoleScore {
                x: candidate_positions[0].0,
                y: candidate_positions[0].1,
                width: target_width,
                height: target_height,
                score: 0.0,
            };

            for (x, y) in candidate_positions {
                let candidate = Rect { left: x, top: y, right: x + target_width, bottom: y + target_height };
                let candidate_area = area(candidate).max(1) as f32;
                let overlap_area = windows.iter().map(|window| area(intersection(candidate, *window))).sum::<i32>() as f32;
                let free_ratio = (1.0 - (overlap_area / candidate_area)).clamp(0.0, 1.0);
                let edge_bias = if x > work_area.left + work_width / 2 { 0.08 } else { 0.02 };
                let score = (free_ratio + edge_bias).clamp(0.0, 1.0);
                if score > best.score {
                    best = HoleScore { x, y, width: target_width, height: target_height, score };
                }
            }

            if best.score <= 0.0 {
                best.score = 0.42;
            }
            best
        }
    }

    unsafe extern "system" fn enum_visible_windows(hwnd: Hwnd, lparam: Lparam) -> Bool {
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let mut cloaked: u32 = 0;
        let _ = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut _ as *mut c_void, size_of::<u32>() as u32);
        if cloaked != 0 {
            return 1;
        }

        let mut rect = Rect::default();
        if GetWindowRect(hwnd, &mut rect as *mut Rect) == 0 {
            return 1;
        }

        if area(rect) <= 0 {
            return 1;
        }

        let windows = &mut *(lparam as *mut Vec<Rect>);
        windows.push(rect);
        1
    }

    fn intersection(left: Rect, right: Rect) -> Rect {
        Rect {
            left: left.left.max(right.left),
            top: left.top.max(right.top),
            right: left.right.min(right.right),
            bottom: left.bottom.min(right.bottom),
        }
    }

    fn area(rect: Rect) -> i32 {
        let width = (rect.right - rect.left).max(0);
        let height = (rect.bottom - rect.top).max(0);
        width.saturating_mul(height)
    }
}
