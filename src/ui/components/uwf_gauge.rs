use crate::ui::surface_projection::SurfaceProjectionState;
use dioxus::prelude::*;
use std::time::Duration;

const REFRACTIVE_SHADER: &str = include_str!("../shaders/refractive.glsl");

#[derive(Clone, Copy, PartialEq)]
enum UwfGaugeState {
    Ghost,
    Amber,
    Critical,
}

#[derive(Clone, Copy, PartialEq)]
struct UwfGaugeVisual {
    state: UwfGaugeState,
    usage_ratio: f32,
    target_opacity: f32,
    hue_mix: f32,
}

#[component]
pub fn UwfGauge(projection: SurfaceProjectionState) -> Element {
    let target = classify_overlay(projection.overlay_consumption);
    let mut target_signal = use_signal(|| target);
    if target_signal() != target {
        target_signal.set(target);
    }

    let mut animated_opacity = use_signal(|| target.target_opacity);
    use_hook(move || {
        spawn(async move {
            loop {
                let current = animated_opacity();
                let next_target = target_signal().target_opacity;
                let delta = next_target - current;
                let next = if delta.abs() < 0.002 {
                    next_target
                } else {
                    current + delta * 0.24
                };
                if (next - current).abs() >= 0.001 {
                    animated_opacity.set(next);
                }
                tokio::time::sleep(Duration::from_millis(16)).await;
            }
        });
    });

    let shader_signature = REFRACTIVE_SHADER.lines().next().unwrap_or("ghost-to-amber");
    let visual = target_signal();
    let animated = animated_opacity().clamp(0.0, 1.0);
    let fill_percent = (0.12 + visual.usage_ratio * 0.88).clamp(0.12, 1.0) * 100.0;
    let ghost_to_amber = visual.hue_mix;
    let (base_color, accent_color, shell_class) = match visual.state {
        UwfGaugeState::Ghost => (
            format!("rgba({}, {}, 255, {:.3})", lerp_u8(0, 0xFF, ghost_to_amber), lerp_u8(240, 184, ghost_to_amber), animated),
            format!("rgba({}, {}, 255, {:.3})", lerp_u8(180, 255, ghost_to_amber), lerp_u8(255, 208, ghost_to_amber), (animated * 0.72).clamp(0.0, 1.0)),
            "cq-uwf-gauge-shell",
        ),
        UwfGaugeState::Amber => (
            format!("rgba(255, 184, 0, {:.3})", animated.max(0.92)),
            format!("rgba(255, 240, 180, {:.3})", (animated * 0.88).clamp(0.0, 1.0)),
            "cq-uwf-gauge-shell cq-uwf-gauge-shell--amber",
        ),
        UwfGaugeState::Critical => (
            "rgba(255, 0, 66, 1.0)".to_string(),
            "rgba(255, 112, 156, 0.92)".to_string(),
            "cq-uwf-gauge-shell cq-uwf-gauge-shell--critical",
        ),
    };

    let shell_style = format!(
        "opacity: {:.3}; --uwf-fill: {:.2}%; --uwf-color: {}; --uwf-accent: {}; --uwf-luma: {:.3};",
        animated,
        fill_percent,
        base_color,
        accent_color,
        (0.35 + ghost_to_amber * 0.65).clamp(0.35, 1.0),
    );

    rsx! {
        div {
            class: shell_class,
            style: "{shell_style}",
            "data-critical": if matches!(visual.state, UwfGaugeState::Critical) { "true" } else { "false" },
            "data-shader": "{shader_signature}",
            div { class: "cq-uwf-gauge-vapor" }
            div { class: "cq-uwf-gauge-core" }
            div { class: "cq-uwf-gauge-fill" }
            div { class: "cq-uwf-gauge-glint" }
        }
    }
}

fn classify_overlay(encoded: u8) -> UwfGaugeVisual {
    let usage_ratio = (encoded as f32 / 255.0).clamp(0.0, 1.0);
    let target_opacity = if usage_ratio <= 0.40 {
        0.15
    } else if usage_ratio >= 0.55 {
        1.0
    } else {
        lerp(0.15, 1.0, (usage_ratio - 0.40) / 0.15)
    };

    let state = if usage_ratio > 0.85 {
        UwfGaugeState::Critical
    } else if usage_ratio >= 0.50 {
        UwfGaugeState::Amber
    } else {
        UwfGaugeState::Ghost
    };

    UwfGaugeVisual {
        state,
        usage_ratio,
        target_opacity,
        hue_mix: ((usage_ratio - 0.40) / 0.15).clamp(0.0, 1.0),
    }
}

fn lerp(start: f32, end: f32, t: f32) -> f32 {
    start + (end - start) * t.clamp(0.0, 1.0)
}

fn lerp_u8(start: u8, end: u8, t: f32) -> u8 {
    lerp(start as f32, end as f32, t).round().clamp(0.0, 255.0) as u8
}
