use crate::models::{ForgeOutput, ProviderTemplateContext, QuantumPacket};
use dioxus::prelude::*;
use std::collections::BTreeSet;

const CAROUSEL_CSS: &str = r#"
.cq-root { padding: 18px; display: grid; gap: 16px; }
.cq-hero { display: grid; gap: 14px; padding: 18px; border-radius: 24px; background: rgba(255,255,255,.84); border: 1px solid rgba(0,0,0,.08); }
.cq-hero-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; flex-wrap: wrap; }
.cq-hero h2 { margin: 0; font-size: clamp(1.3rem, 2.3vw, 1.95rem); letter-spacing: -.04em; }
.cq-hero p, .cq-helper { color: #5f625f; line-height: 1.5; }
.cq-row { display: flex; gap: 8px; flex-wrap: wrap; }
.cq-chip { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(0,0,0,.06); font-size: .86rem; }
.cq-chip.green { background: rgba(12,140,98,.12); color: #0a6b4c; }
.cq-chip.orange { background: rgba(255,109,45,.12); color: #b94c1b; }
.cq-grid { display: grid; grid-template-columns: 1.1fr 1fr; gap: 12px; }
.cq-card-panel { padding: 15px; border-radius: 20px; background: rgba(255,255,255,.76); border: 1px solid rgba(0,0,0,.07); display: grid; gap: 12px; }
.cq-input, .cq-textarea { width: 100%; border: 1px solid rgba(0,0,0,.08); border-radius: 14px; padding: 12px 14px; background: rgba(255,255,255,.92); }
.cq-textarea { min-height: 110px; resize: vertical; }
.cq-trigger { position: relative; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; min-height: 46px; border-radius: 999px; padding: 12px 15px; background: #161616; color: white; cursor: pointer; }
.cq-trigger.secondary { background: rgba(0,0,0,.08); color: #161616; }
.cq-trigger input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.cq-track-shell { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: stretch; }
.cq-nav { width: 52px; border: 0; border-radius: 18px; background: rgba(0,0,0,.08); cursor: pointer; }
.cq-track { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 12px; }
.cq-card, .cq-empty { min-height: 390px; border-radius: 24px; border: 1px solid rgba(0,0,0,.08); overflow: hidden; background: rgba(255,255,255,.82); }
.cq-card { display: grid; grid-template-rows: auto 170px auto 1fr auto; transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; box-shadow: 0 16px 36px rgba(0,0,0,.06); }
.cq-card[data-center='true'] { transform: translateY(-6px); border-color: rgba(12,140,98,.38); box-shadow: 0 28px 44px rgba(12,140,98,.12); }
.cq-card[data-selected='true'] { border-color: rgba(255,109,45,.4); }
.cq-card[data-master='true'] { outline: 2px solid rgba(12,140,98,.22); outline-offset: -2px; }
.cq-top, .cq-foot { display: flex; justify-content: space-between; gap: 8px; align-items: center; padding: 14px; }
.cq-preview { margin: 0 14px; border-radius: 18px; border: 1px solid rgba(0,0,0,.06); background: linear-gradient(135deg, #f7f5ef, #ece3d8); display: grid; place-items: center; overflow: hidden; }
.cq-preview img { width: 100%; height: 100%; object-fit: cover; }
.cq-preview-fallback { display: grid; gap: 8px; place-items: center; padding: 18px; text-align: center; }
.cq-mark { width: 68px; height: 68px; border-radius: 18px; background: rgba(0,0,0,.08); display: grid; place-items: center; font-size: 1.2rem; font-weight: 800; }
.cq-body { display: grid; gap: 10px; padding: 14px; }
.cq-body strong { line-height: 1.12; letter-spacing: -.03em; }
.cq-copy { color: #5f625f; line-height: 1.45; font-size: .92rem; }
.cq-tags { display: flex; flex-wrap: wrap; gap: 6px; }
.cq-tag { padding: 5px 8px; border-radius: 999px; background: rgba(0,0,0,.06); font-size: .78rem; }
.cq-btn { border: 0; padding: 10px 12px; border-radius: 999px; cursor: pointer; background: rgba(0,0,0,.08); }
.cq-btn.dark { background: #161616; color: white; }
.cq-empty { display: grid; place-items: center; padding: 16px; text-align: center; color: #5f625f; border-style: dashed; }
.cq-footnote { padding: 14px 16px; border-radius: 18px; background: rgba(255,255,255,.72); border: 1px solid rgba(0,0,0,.08); color: #5f625f; line-height: 1.5; }
@media (max-width: 1180px) { .cq-grid { grid-template-columns: 1fr; } .cq-track-shell { grid-template-columns: 1fr; } .cq-nav { display: none; } .cq-track { grid-template-columns: repeat(2, minmax(0,1fr)); } }
@media (max-width: 720px) { .cq-root { padding: 14px; } .cq-track { grid-template-columns: 1fr; } }
"#;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkspaceMode { Create, Edit }

#[derive(Clone, Debug)]
pub struct WorkbenchItem {
    pub client_id: u64,
    pub packet: QuantumPacket,
    pub preview_url: Option<String>,
    pub source_label: String,
    pub dirty: bool,
    pub is_master_template: bool,
}

impl WorkbenchItem {
    pub fn from_packet(client_id: u64, packet: QuantumPacket, source_label: String) -> Self {
        Self { client_id, packet, preview_url: None, source_label, dirty: false, is_master_template: false }
    }
    pub fn preview_monogram(&self) -> String {
        self.packet.artwork.file_name.chars().filter(|ch| ch.is_ascii_alphabetic()).take(2).collect::<String>().to_ascii_uppercase()
    }
}

impl PartialEq for WorkbenchItem {
    fn eq(&self, other: &Self) -> bool {
        self.client_id == other.client_id
            && self.preview_url == other.preview_url
            && self.source_label == other.source_label
            && self.dirty == other.dirty
            && self.is_master_template == other.is_master_template
            && self.packet.forge.title == other.packet.forge.title
            && self.packet.forge.description == other.packet.forge.description
            && self.packet.forge.tags == other.packet.forge.tags
            && self.packet.forge.qc_approved == other.packet.forge.qc_approved
            && self.packet.forge.publish_ready == other.packet.forge.publish_ready
            && self.packet.artwork.file_name == other.packet.artwork.file_name
            && self.packet.platform.sku == other.packet.platform.sku
            && self.packet.platform.quantity == other.packet.platform.quantity
            && (self.packet.platform.price_major - other.packet.platform.price_major).abs() < f64::EPSILON
    }
}

#[derive(Clone, PartialEq, Eq, Debug, Default)]
pub struct BatchMetadataDraft {
    pub title_prefix: String,
    pub description_append: String,
    pub tags_csv: String,
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct ImportedImageStub {
    pub file_name: String,
    pub preview_url: Option<String>,
    pub mime_hint: Option<String>,
}

impl ImportedImageStub {
    pub fn from_file_name(file_name: String) -> Self {
        let lower = file_name.to_ascii_lowercase();
        let mime_hint = if lower.ends_with(".png") { Some("image/png".to_string()) }
        else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") { Some("image/jpeg".to_string()) }
        else if lower.ends_with(".webp") { Some("image/webp".to_string()) }
        else { None };
        Self { file_name, preview_url: None, mime_hint }
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PipelinePhase { Idle, Intake, TemplateLocked, Drafting, Review, ReadyToPublish, Publishing }
impl PipelinePhase {
    pub fn label(self) -> &'static str {
        match self {
            Self::Idle => "Idle",
            Self::Intake => "Asset Intake",
            Self::TemplateLocked => "Template Locked",
            Self::Drafting => "Drafting Packets",
            Self::Review => "Metadata Review",
            Self::ReadyToPublish => "Ready",
            Self::Publishing => "Publishing",
        }
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub struct PipelineStatus {
    pub phase: PipelinePhase,
    pub queued_jobs: usize,
    pub completed_jobs: usize,
    pub blocked_jobs: usize,
    pub note: String,
}
impl Default for PipelineStatus {
    fn default() -> Self {
        Self { phase: PipelinePhase::Idle, queued_jobs: 0, completed_jobs: 0, blocked_jobs: 0, note: "Waiting for the first command.".to_string() }
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum PipelineCommand {
    MasterTemplateLoaded { title: String },
    ImagesStaged { count: usize },
    ImagesQueued { count: usize },
    MetadataEdited { count: usize },
    ReviewReady { count: usize },
    PublishQueued { count: usize },
}

#[component]
pub fn QuantumCarousel(
    mode: WorkspaceMode,
    items: Signal<Vec<WorkbenchItem>>,
    center_index: Signal<usize>,
    selected_ids: Signal<BTreeSet<u64>>,
    master_template_id: Signal<Option<u64>>,
    pending_imports: Signal<Vec<ImportedImageStub>>,
    pipeline: Signal<PipelineStatus>,
    batch_draft: Signal<BatchMetadataDraft>,
    on_set_center: EventHandler<usize>,
    on_toggle_select: EventHandler<u64>,
    on_set_master: EventHandler<u64>,
    on_import_master_template: EventHandler<String>,
    on_import_images: EventHandler<Vec<ImportedImageStub>>,
    on_update_batch_title: EventHandler<String>,
    on_update_batch_description: EventHandler<String>,
    on_update_batch_tags: EventHandler<String>,
    on_apply_batch: EventHandler<()>,
) -> Element {
    let collection = items();
    let total = collection.len();
    let safe_center = if total == 0 { 0 } else { center_index().min(total - 1) };
    let window = visible_window(&collection, safe_center, 5);
    let draft = batch_draft();
    let staged = pending_imports();

    rsx! {
        style { "{CAROUSEL_CSS}" }
        div { class: "cq-root",
            section { class: "cq-hero",
                div { class: "cq-hero-head",
                    div {
                        h2 {
                            if mode == WorkspaceMode::Create {
                                "Lock once, fan out a hundred packet drafts without leaving the center rail."
                            } else {
                                "Sweep metadata across selected listings while the active draft stays centered."
                            }
                        }
                        p {
                            if mode == WorkspaceMode::Create {
                                "The browser only hands Wasm user-approved files. We keep imports ephemeral, drafts typed, and publish execution outside the render tree."
                            } else {
                                "Edit mode is intentionally narrow: select, patch, approve, and queue. No hidden side effects."
                            }
                        }
                    }
                    div { class: "cq-row",
                        span { class: "cq-chip green", "{pipeline().phase.label()}" }
                        span { class: "cq-chip", "Centered: {safe_center + usize::from(total > 0)} / {total.max(1)}" }
                        span { class: "cq-chip orange", "Selected: {selected_ids().len()}" }
                    }
                }

                if mode == WorkspaceMode::Create {
                    div { class: "cq-grid",
                        div { class: "cq-card-panel",
                            h3 { "Master Template Intake" }
                            p { class: "cq-helper", "Import a trusted master template first. Every image drop after that becomes a cloned QuantumPacket draft." }
                            div { class: "cq-row",
                                label { class: "cq-trigger",
                                    "Load Master Template"
                                    input {
                                        r#type: "file",
                                        accept: ".json,application/json",
                                        onchange: move |evt| {
                                            if let Some(files) = evt.files() {
                                                if let Some(first) = files.files().into_iter().next() {
                                                    on_import_master_template.call(first);
                                                }
                                            }
                                        }
                                    }
                                }
                                label { class: "cq-trigger secondary",
                                    "Add 1-100 Images"
                                    input {
                                        r#type: "file",
                                        accept: "image/*",
                                        multiple: true,
                                        onchange: move |evt| {
                                            if let Some(files) = evt.files() {
                                                let imports = files.files().into_iter().take(100).map(ImportedImageStub::from_file_name).collect::<Vec<_>>();
                                                if !imports.is_empty() { on_import_images.call(imports); }
                                            }
                                        }
                                    }
                                }
                            }
                            div { class: "cq-row",
                                if master_template_id().is_some() {
                                    span { class: "cq-chip green", "Master armed" }
                                } else {
                                    span { class: "cq-chip orange", "No master template yet" }
                                }
                                span { class: "cq-chip", "Staged assets: {staged.len()}" }
                            }
                        }
                        div { class: "cq-card-panel",
                            h3 { "Create Rail Rules" }
                            p { class: "cq-helper", "1. Template first. 2. Assets next. 3. Carousel keeps the current draft centered. 4. Publishing stays an explicit backend command." }
                        }
                    }
                } else {
                    div { class: "cq-grid",
                        div { class: "cq-card-panel",
                            h3 { "Batch Metadata Sweep" }
                            input {
                                class: "cq-input",
                                value: "{draft.title_prefix}",
                                placeholder: "Title prefix, e.g. Drop 03",
                                oninput: move |evt| on_update_batch_title.call(evt.value())
                            }
                            textarea {
                                class: "cq-textarea",
                                value: "{draft.description_append}",
                                placeholder: "Append a shared description block",
                                oninput: move |evt| on_update_batch_description.call(evt.value())
                            }
                            input {
                                class: "cq-input",
                                value: "{draft.tags_csv}",
                                placeholder: "tag-one, tag-two, tag-three",
                                oninput: move |evt| on_update_batch_tags.call(evt.value())
                            }
                        }
                        div { class: "cq-card-panel",
                            h3 { "Edit Rail Rules" }
                            p { class: "cq-helper", "Selection is explicit. The component never infers publish intent from edits. That keeps bulk changes safe." }
                            button { class: "cq-btn dark", onclick: move |_| on_apply_batch.call(()), "Apply Batch To Selection" }
                        }
                    }
                }
            }

            div { class: "cq-track-shell",
                button {
                    class: "cq-nav",
                    disabled: total == 0 || safe_center == 0,
                    onclick: move |_| on_set_center.call(safe_center.saturating_sub(1)),
                    "←"
                }
                if total == 0 {
                    div { class: "cq-track",
                        div { class: "cq-empty", "Bring in a master template or existing item set to start the rail." }
                        div { class: "cq-empty", "Slot 2 / waiting" }
                        div { class: "cq-empty", "Slot 3 / centered" }
                        div { class: "cq-empty", "Slot 4 / waiting" }
                        div { class: "cq-empty", "Slot 5 / waiting" }
                    }
                } else {
                    div { class: "cq-track",
                        for (absolute_index, maybe_item) in window {
                            if let Some(item) = maybe_item {
                                WorkbenchCard {
                                    item: item.clone(),
                                    absolute_index,
                                    mode,
                                    is_center: absolute_index == safe_center,
                                    is_selected: selected_ids().contains(&item.client_id),
                                    is_master: master_template_id() == Some(item.client_id),
                                    on_set_center: on_set_center.clone(),
                                    on_toggle_select: on_toggle_select.clone(),
                                    on_set_master: on_set_master.clone(),
                                }
                            } else {
                                div { class: "cq-empty", "Open slot" }
                            }
                        }
                    }
                }
                button {
                    class: "cq-nav",
                    disabled: total == 0 || safe_center + 1 >= total,
                    onclick: move |_| on_set_center.call((safe_center + 1).min(total.saturating_sub(1))),
                    "→"
                }
            }

            div { class: "cq-footnote",
                if mode == WorkspaceMode::Create {
                    "Create mode is optimized for a short publish path: import template, add image set, inspect the centered draft, remaster if needed, then hand off to the backend publish queue."
                } else {
                    "Edit mode keeps the centered listing readable while the multi-select batch stays deterministic. Sweep metadata here, then trigger review or publish from the shell."
                }
            }
        }
    }
}

#[component]
fn WorkbenchCard(
    item: WorkbenchItem,
    absolute_index: usize,
    mode: WorkspaceMode,
    is_center: bool,
    is_selected: bool,
    is_master: bool,
    on_set_center: EventHandler<usize>,
    on_toggle_select: EventHandler<u64>,
    on_set_master: EventHandler<u64>,
) -> Element {
    let forge = item.packet.forge.clone();
    let description_preview = truncate_words(&forge.description, 18);
    rsx! {
        article {
            class: "cq-card",
            "data-center": if is_center { "true" } else { "false" },
            "data-selected": if is_selected { "true" } else { "false" },
            "data-master": if is_master { "true" } else { "false" },
            onclick: move |_| on_set_center.call(absolute_index),
            div { class: "cq-top",
                div { class: "cq-row",
                    if is_master { span { class: "cq-chip green", "Master" } }
                    if forge.publish_ready { span { class: "cq-chip orange", "Ready" } }
                    if item.dirty { span { class: "cq-chip", "Dirty" } }
                }
                span { class: "cq-chip", "#{item.client_id}" }
            }
            div { class: "cq-preview",
                if let Some(preview) = item.preview_url.as_deref() {
                    img { src: "{preview}", alt: "{item.packet.artwork.file_name}" }
                } else {
                    div { class: "cq-preview-fallback",
                        div { class: "cq-mark", "{item.preview_monogram()}" }
                        div { "{item.packet.artwork.file_name}" }
                    }
                }
            }
            div { class: "cq-body",
                strong { "{forge.title}" }
                div { class: "cq-copy", "{description_preview}" }
                div { class: "cq-tags",
                    for tag in forge.tags.iter().take(4) { span { class: "cq-tag", "#{tag}" } }
                }
            }
            div { class: "cq-foot",
                if mode == WorkspaceMode::Create {
                    if is_master {
                        span { class: "cq-chip green", "Template Locked" }
                    } else {
                        button { class: "cq-btn", onclick: move |_| on_set_master.call(item.client_id), "Make Master" }
                    }
                    button { class: "cq-btn dark", onclick: move |_| on_set_center.call(absolute_index), "Focus" }
                } else {
                    button { class: "cq-btn", onclick: move |_| on_toggle_select.call(item.client_id), if is_selected { "Deselect" } else { "Select" } }
                    button { class: "cq-btn dark", onclick: move |_| on_set_center.call(absolute_index), "Inspect" }
                }
            }
        }
    }
}

fn visible_window(items: &[WorkbenchItem], center_index: usize, visible_slots: usize) -> Vec<(usize, Option<WorkbenchItem>)> {
    if items.is_empty() {
        return (0..visible_slots).map(|idx| (idx, None)).collect();
    }
    let half = visible_slots / 2;
    let safe_center = center_index.min(items.len().saturating_sub(1));
    let mut start = safe_center.saturating_sub(half);
    let mut end = (start + visible_slots).min(items.len());
    if end - start < visible_slots {
        start = end.saturating_sub(visible_slots.min(items.len()));
        end = (start + visible_slots).min(items.len());
    }
    let mut slots = items[start..end].iter().cloned().enumerate().map(|(offset, item)| (start + offset, Some(item))).collect::<Vec<_>>();
    while slots.len() < visible_slots { let filler_index = items.len() + slots.len(); slots.push((filler_index, None)); }
    slots
}

fn truncate_words(input: &str, limit: usize) -> String {
    let words = input.split_whitespace().collect::<Vec<_>>();
    if words.len() <= limit { input.to_string() } else { format!("{}…", words[..limit].join(" ")) }
}


