use crate::ui::surface_projection::SurfaceProjectionState;
use dioxus::prelude::*;

#[component]
pub fn SurfaceSpectralBar(projection: SurfaceProjectionState) -> Element {
    let active_segment = usize::from(projection.category_pointer) / 8;
    let human_strength = projection.human_voice_intensity as f32 / 255.0;
    let ai_strength = projection.ai_voice_intensity as f32 / 255.0;
    let voice_active = human_strength > 0.02 || ai_strength > 0.02;

    rsx! {
        div { class: "cq-spectral-shell",
            div { class: "cq-spectral-caption",
                "Pulsar Sector {projection.category_pointer:02}/95"
            }
            div {
                class: "cq-spectral-bar",
                "data-novelty": if projection.novelty_active { "true" } else { "false" },
                "data-voice": if voice_active { "true" } else { "false" },
                for segment in 0..12 {
                    {
                        let human_bleed = (human_strength * (1.0 - (segment as f32 - active_segment as f32).abs() / 12.0)).clamp(0.0, 1.0);
                        let ai_bleed = (ai_strength * (1.0 - (segment as f32 - active_segment as f32).abs() / 10.0)).clamp(0.0, 1.0);
                        let shimmer = if voice_active && (segment + active_segment) % 2 == 0 { 1.06 } else { 1.0 };
                        let spectral_fill = if segment == active_segment { 0.92 } else { 0.18 };
                        let style = format!(
                            "background: linear-gradient(180deg, rgba(192, 132, 252, {spectral_fill:.3}), rgba(139, 92, 246, 0.24) 40%, rgba(34, 211, 238, {human_bleed:.3}) 72%, rgba(249, 115, 22, {ai_bleed:.3}) 100%); box-shadow: 0 0 calc(8px + {human_bleed:.3} * 14px) rgba(34, 211, 238, {human_bleed:.3}), 0 0 calc(8px + {ai_bleed:.3} * 14px) rgba(249, 115, 22, {ai_bleed:.3}); transform: scaleY({shimmer:.3});"
                        );
                        rsx! {
                            div {
                                class: "cq-spectral-cell",
                                "data-active": if segment == active_segment { "true" } else { "false" },
                                "data-novelty": if projection.novelty_active && segment == active_segment { "true" } else { "false" },
                                style: "{style}",
                            }
                        }
                    }
                }
            }
        }
    }
}
