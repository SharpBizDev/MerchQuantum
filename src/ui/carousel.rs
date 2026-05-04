use crate::models::QuantumPacket;
use base64::engine::general_purpose::STANDARD;
use base64::Engine as _;
use dioxus::html::{FileEngine, HasFileData};
use dioxus::prelude::*;
use std::collections::BTreeSet;
use std::sync::Arc;

const CAROUSEL_CSS: &str = r#"
.mq-stage {
    display: grid;
    gap: 18px;
    font-family: "Inter", system-ui, sans-serif;
}

.mq-topline {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.mq-heading {
    display: grid;
    gap: 6px;
}

.mq-heading h2 {
    margin: 0;
    font-size: 1.35rem;
    letter-spacing: -0.03em;
    color: #f3f4f6;
}

.mq-heading p {
    margin: 0;
    color: #9ca3af;
    line-height: 1.55;
}

.mq-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mq-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid #1f2937;
    color: #9ca3af;
    font-size: 0.84rem;
}

.mq-chip--active {
    color: #f3f4f6;
    border-color: rgba(139, 92, 246, 0.5);
    box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.24) inset;
}

.mq-chip--success {
    color: #d1fae5;
    border-color: rgba(16, 185, 129, 0.4);
    background: rgba(16, 185, 129, 0.12);
}

.mq-dropzone,
.mq-editor,
.mq-staged,
.mq-track-wrap {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(17, 24, 39, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
}

.mq-dropzone {
    padding: 18px;
    display: grid;
    gap: 12px;
    border-style: dashed;
    background:
        radial-gradient(circle at top left, rgba(139, 92, 246, 0.16), transparent 30%),
        linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(17, 24, 39, 0.84));
}

.mq-dropzone[data-mode='edit'] {
    background: linear-gradient(180deg, rgba(17, 24, 39, 0.92), rgba(17, 24, 39, 0.84));
}

.ingestion-dropzone {
    border: 2px dashed #444;
    background: #0a0a0a;
    min-height: 200px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease-in-out;
}

.ingestion-dropzone.active-glow {
    border-color: #00ffcc;
    box-shadow: 0 0 15px #00ffcc;
    background: #111;
}

.portal-text {
    font-family: monospace;
    color: #00ffcc;
    font-size: 1.2rem;
}

.sub-text {
    color: #9ca3af;
    font-family: monospace;
    font-size: 0.82rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
}

.mq-dropzone h3,
.mq-editor h3,
.mq-staged h3 {
    margin: 0;
    color: #f3f4f6;
    letter-spacing: -0.03em;
}

.mq-dropzone p,
.mq-editor p,
.mq-staged p {
    margin: 0;
    color: #9ca3af;
    line-height: 1.55;
}

.mq-action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.mq-button,
.mq-file-label,
.mq-input,
.mq-textarea {
    border-radius: 8px;
    font: inherit;
}

.mq-button,
.mq-file-label {
    border: 1px solid #1f2937;
    background: rgba(255, 255, 255, 0.04);
    color: #f3f4f6;
    padding: 11px 14px;
}

.mq-file-label {
    position: relative;
    cursor: pointer;
    overflow: hidden;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
}

.mq-file-label input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
}

.mq-button--purple,
.mq-file-label--purple {
    background: #8b5cf6;
    border-color: rgba(139, 92, 246, 0.45);
    color: #ffffff;
}

.mq-button--green {
    background: rgba(16, 185, 129, 0.16);
    border-color: rgba(16, 185, 129, 0.35);
    color: #d1fae5;
}

.mq-editor {
    padding: 16px;
    display: grid;
    gap: 12px;
}

.mq-editor-grid {
    display: grid;
    gap: 10px;
}

.mq-input,
.mq-textarea {
    width: 100%;
    border: 1px solid #1f2937;
    background: #0b0f19;
    color: #f3f4f6;
    padding: 11px 12px;
}

.mq-textarea {
    min-height: 108px;
    resize: vertical;
}

.mq-track-wrap {
    padding: 16px;
    display: grid;
    gap: 14px;
}

.mq-track-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.mq-track-bar h3 {
    margin: 0;
    color: #f3f4f6;
}

.mq-track {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 12px;
    align-items: stretch;
}

.mq-nav {
    width: 42px;
    min-width: 42px;
    border-radius: 8px;
    border: 1px solid #1f2937;
    background: rgba(255, 255, 255, 0.04);
    color: #f3f4f6;
}

.mq-nav:disabled {
    opacity: 0.4;
}

.mq-track-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(190px, 1fr));
    gap: 14px;
    min-width: 0;
}

.mq-card,
.mq-card-empty {
    min-height: 280px;
    border-radius: 12px;
    border: 1px solid #1f2937;
    background: #0f172a;
}

.mq-card {
    padding: 16px;
    display: grid;
    gap: 12px;
    align-content: start;
    background: linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(15, 23, 42, 0.98));
    transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, opacity 160ms ease, filter 160ms ease;
}

.mq-card[data-active='true'] {
    border-color: rgba(139, 92, 246, 0.72);
    box-shadow: inset 0 0 20px rgba(139, 92, 246, 0.28), 0 0 20px rgba(139, 92, 246, 0.5), 0 0 0 1px rgba(139, 92, 246, 0.32) inset, 0 0 40px rgba(139, 92, 246, 0.2);
    transform: scale(1.05) translateY(-4px);
    opacity: 1;
    filter: none;
}

.mq-card[data-active='false'] {
    opacity: 0.4;
    filter: saturate(0.3) grayscale(70%) blur(2px);
}

.mq-card[data-selected='true'] {
    border-color: rgba(16, 185, 129, 0.5);
    opacity: 1;
    filter: none;
}

.mq-card-empty {
    display: grid;
    place-items: center;
    color: #6b7280;
    font-size: 0.92rem;
    text-align: center;
    padding: 12px;
}

.mq-card-preview {
    aspect-ratio: 4 / 5;
    border-radius: 8px;
    border: 1px solid #1f2937;
    background: linear-gradient(135deg, rgba(139, 92, 246, 0.18), rgba(17, 24, 39, 0.6));
    overflow: hidden;
    display: grid;
    place-items: center;
}

.mq-card-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.mq-preview-fallback {
    display: grid;
    gap: 8px;
    justify-items: center;
    color: #f3f4f6;
}

.mq-preview-fallback strong {
    width: 54px;
    height: 54px;
    border-radius: 8px;
    display: grid;
    place-items: center;
    background: rgba(255, 255, 255, 0.08);
}

.mq-card h4 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: -0.02em;
    color: #f3f4f6;
}

.mq-card p {
    margin: 0;
    color: #9ca3af;
    line-height: 1.5;
    font-size: 0.92rem;
}

.mq-card-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.mq-orb-wrap {
    display: flex;
    justify-content: center;
    padding-top: 8px;
}

.mq-orb {
    width: 96px;
    height: 96px;
    border-radius: 999px;
    border: 1px solid rgba(139, 92, 246, 0.5);
    background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.16), rgba(139, 92, 246, 0.24) 32%, rgba(11, 15, 25, 0.96) 70%);
    color: #f3f4f6;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 0.68rem;
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.18) inset;
    transition: all 0.3s ease;
}

.mq-orb[data-armed='true'] {
    animation: mq-orb-pulse 1.8s ease-in-out infinite;
}

.mq-orb:hover {
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.85), 0 0 0 1px rgba(139, 92, 246, 0.24) inset;
    transform: scale(1.05) translateY(-4px);
}

@keyframes mq-card-enter {
    0% {
        opacity: 0;
        transform: translateY(18px) scale(0.98);
    }

    100% {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

@keyframes mq-orb-pulse {
    0%, 100% {
        box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.18) inset, 0 0 18px rgba(139, 92, 246, 0.22);
        transform: scale(1);
    }

    50% {
        box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.32) inset, 0 0 34px rgba(139, 92, 246, 0.58);
        transform: scale(1.06);
    }
}

.mq-staged {
    padding: 16px;
    display: grid;
    gap: 12px;
}

.mq-staged-list {
    display: grid;
    gap: 8px;
}

.mq-staged-item {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border-radius: 8px;
    border: 1px solid #1f2937;
    background: rgba(255, 255, 255, 0.03);
}

.mq-staged-meta {
    min-width: 0;
    display: grid;
    gap: 4px;
}

.mq-staged-name {
    color: #f3f4f6;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mq-staged-url {
    color: #9ca3af;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}


.mq-button,
.mq-file-label,
.mq-input,
.mq-textarea,
.mq-nav,
.mq-orb,
.mq-card,
.mq-staged-item {
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.mq-button,
.mq-file-label {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.04);
}

.mq-input,
.mq-textarea {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
        #0b0f19;
}

.mq-nav {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.04);
}

.mq-card,
.mq-card-empty {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        #0f172a;
}

.mq-card {
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        linear-gradient(180deg, rgba(17, 24, 39, 0.94), rgba(15, 23, 42, 0.98));
    animation: mq-card-enter 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.mq-chip,
.mq-input,
.mq-textarea,
.mq-staged-name,
.mq-staged-url,
.mq-card h4 {
    font-family: "JetBrains Mono", "Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
    letter-spacing: 0.05em;
}

.mq-chip {
    font-weight: 600;
}

.mq-input,
.mq-textarea,
.mq-staged-name,
.mq-staged-url,
.mq-card h4 {
    font-weight: 600;
}

.mq-track-grid {
    gap: 24px;
}

.mq-card {
    animation: mq-card-enter 0.28s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.mq-card[data-active='false'] {
    opacity: 0.42;
    filter: saturate(0.3) grayscale(70%) blur(2px);
}

.mq-card[data-active='true'] {
    box-shadow:
        inset 0 0 22px rgba(139, 92, 246, 0.34),
        0 0 0 1px rgba(139, 92, 246, 0.3) inset,
        0 0 28px rgba(139, 92, 246, 0.46);
    transform: scale(1.05) translateY(-4px);
}
@media (max-width: 1200px) {
    .mq-track-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

@media (max-width: 720px) {
    .mq-track {
        grid-template-columns: 1fr;
    }

    .mq-nav {
        width: 100%;
    }

    .mq-track-grid {
        grid-template-columns: 1fr;
    }
}
"#;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum WorkspaceMode {
    Create,
    Edit,
}

#[derive(Clone, Debug)]
pub struct WorkbenchItem {
    pub client_id: u64,
    pub packet: QuantumPacket,
    pub preview_url: Option<String>,
    pub source_label: String,
    pub dirty: bool,
    pub is_master_template: bool,
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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PipelinePhase {
    Idle,
    Intake,
    TemplateLocked,
    Drafting,
    Review,
    ReadyToPublish,
    Publishing,
}

impl PipelinePhase {
    pub fn label(self) -> &'static str {
        match self {
            Self::Idle => "Idle",
            Self::Intake => "Intake",
            Self::TemplateLocked => "Template Locked",
            Self::Drafting => "Drafting",
            Self::Review => "Review",
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
        Self {
            phase: PipelinePhase::Idle,
            queued_jobs: 0,
            completed_jobs: 0,
            blocked_jobs: 0,
            note: "Ready".to_string(),
        }
    }
}

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum PipelineCommand {
    ImagesStaged { count: usize },
    PublishQueued { count: usize },
}

#[component]
pub fn QuantumCarousel(
    mode: WorkspaceMode,
    items: ReadOnlySignal<Vec<WorkbenchItem>>,
    center_index: ReadOnlySignal<usize>,
    selected_ids: ReadOnlySignal<BTreeSet<u64>>,
    master_template_id: ReadOnlySignal<Option<u64>>,
    pending_imports: ReadOnlySignal<Vec<ImportedImageStub>>,
    pipeline: ReadOnlySignal<PipelineStatus>,
    batch_draft: ReadOnlySignal<BatchMetadataDraft>,
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
    let library = items();
    let safe_center = if library.is_empty() {
        0
    } else {
        center_index().min(library.len().saturating_sub(1))
    };
    let visible_cards = visible_window(&library, safe_center, 5);
    let staged = pending_imports();
    let stage_count = staged.len();
    let pipeline_status = pipeline();
    let draft = batch_draft();
    let selected = selected_ids();

    rsx! {
        style { "{CAROUSEL_CSS}" }
        div { class: "mq-stage",
            div { class: "mq-topline",
                div { class: "mq-heading",
                    h2 { "Quantum Carousel" }
                    p { "Five-up browsing stays centered on the active card while the intake rail keeps large image batches moving safely into app state." }
                }
                div { class: "mq-chip-row",
                    span { class: "mq-chip mq-chip--active", "{pipeline_status.phase.label()}" }
                    span { class: "mq-chip", "Stage: {stage_count}" }
                    span { class: "mq-chip mq-chip--success", "Selected: {selected.len()}" }
                }
            }

            if mode == WorkspaceMode::Create {
                IngestionPortal {
                    on_import_master_template,
                    on_import_images,
                }
            } else {
                div { class: "mq-editor",
                    h3 { "Batch Edit Rail" }
                    p { "Sweep metadata across your selected listings without leaving the centered inspection flow." }
                    div { class: "mq-editor-grid",
                        input {
                            class: "mq-input",
                            value: "{draft.title_prefix}",
                            placeholder: "Title prefix",
                            oninput: move |evt| on_update_batch_title.call(evt.value()),
                        }
                        textarea {
                            class: "mq-textarea",
                            value: "{draft.description_append}",
                            placeholder: "Append to description",
                            oninput: move |evt| on_update_batch_description.call(evt.value()),
                        }
                        input {
                            class: "mq-input",
                            value: "{draft.tags_csv}",
                            placeholder: "tags, comma, separated",
                            oninput: move |evt| on_update_batch_tags.call(evt.value()),
                        }
                    }
                    div { class: "mq-orb-wrap",
                        button {
                            class: "mq-orb",
                            "data-armed": if !selected.is_empty() { "true" } else { "false" },
                            onclick: move |_| on_apply_batch.call(()),
                            "Forge"
                        }
                    }
                }
            }

            div { class: "mq-track-wrap",
                div { class: "mq-track-bar",
                    h3 { "Focused Template Rail" }
                    div { class: "mq-chip-row",
                        span { class: "mq-chip", "Center Slot: {safe_center + usize::from(!library.is_empty())}" }
                        span { class: "mq-chip", {format!("Master: {}", master_template_id().map(|id| id.to_string()).unwrap_or_else(|| String::from("none")))} }
                    }
                }
                div { class: "mq-track",
                    button {
                        class: "mq-nav",
                        disabled: safe_center == 0 || library.is_empty(),
                        onclick: move |_| on_set_center.call(safe_center.saturating_sub(1)),
                        "<"
                    }
                    div { class: "mq-track-grid",
                        for (absolute_index, maybe_item) in visible_cards {
                            if let Some(item) = maybe_item {
                                WorkbenchCard {
                                    item: item.clone(),
                                    absolute_index,
                                    centered: absolute_index == safe_center,
                                    selected: selected.contains(&item.client_id),
                                    on_set_center: on_set_center.clone(),
                                    on_toggle_select: on_toggle_select.clone(),
                                    on_set_master: on_set_master.clone(),
                                    mode,
                                }
                            } else {
                                div { class: "mq-card-empty", "Waiting for item" }
                            }
                        }
                    }
                    button {
                        class: "mq-nav",
                        disabled: library.is_empty() || safe_center + 1 >= library.len(),
                        onclick: move |_| on_set_center.call((safe_center + 1).min(library.len().saturating_sub(1))),
                        ">"
                    }
                }
            }

            div { class: "mq-staged",
                h3 { "Pending Intake" }
                if staged.is_empty() {
                    p { "No artwork staged yet. Drop a batch or use the picker to seed pending imports in app state." }
                } else {
                    div { class: "mq-staged-list",
                        for file in staged.iter().take(12) {
                            div { class: "mq-staged-item",
                                div { class: "mq-staged-meta",
                                    span { class: "mq-staged-name", "{file.file_name}" }
                                    span { class: "mq-staged-url", {file.preview_url.clone().unwrap_or_else(|| "preview pending".to_string())} }
                                }
                                span { class: "mq-chip", {file.mime_hint.clone().unwrap_or_else(|| "unknown".to_string())} }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn IngestionPortal(
    on_import_master_template: EventHandler<String>,
    on_import_images: EventHandler<Vec<ImportedImageStub>>,
) -> Element {
    let mut drag_over = use_signal(|| false);

    let import_from_input = {
        let on_import_images = on_import_images.clone();
        move |evt: FormEvent| {
            let files = evt.files();
            let on_import_images = on_import_images.clone();
            spawn(async move {
                let imports = collect_imported_images(files).await;
                if !imports.is_empty() {
                    on_import_images.call(imports);
                }
            });
        }
    };

    let import_from_drop = {
        let mut drag_over = drag_over;
        let on_import_images = on_import_images.clone();
        move |evt: DragEvent| {
            drag_over.set(false);
            let files = evt.files();
            let dropped_names = files.as_ref().map(|engine| engine.files()).unwrap_or_default();
            if !dropped_names.is_empty() {
                println!("Assets dropped: {:?}", dropped_names);
            }
            let on_import_images = on_import_images.clone();
            spawn(async move {
                let imports = collect_imported_images(files).await;
                if !imports.is_empty() {
                    on_import_images.call(imports);
                }
            });
        }
    };

    rsx! {
        div {
            class: if drag_over() { "mq-dropzone ingestion-dropzone active-glow" } else { "mq-dropzone ingestion-dropzone" },
            ondragover: move |_| drag_over.set(true),
            ondragleave: move |_| drag_over.set(false),
            ondrop: import_from_drop,
            h3 { class: "portal-text", "DROP RAW ASSETS HERE" }
            span { class: "sub-text", "S.Q.R.F. INITIATED ON DROP" }
            p { "Accepts PNG and JPG artwork only. Dropped or selected files are parsed into file names and preview URLs, then handed off to the shared intake state." }
            div { class: "mq-action-row",
                label {
                    class: "mq-file-label mq-file-label--purple",
                    "Select PNG/JPG Files"
                    input {
                        r#type: "file",
                        accept: ".png,.jpg,.jpeg,image/png,image/jpeg",
                        multiple: true,
                        onchange: import_from_input,
                    }
                }
                button {
                    class: "mq-button",
                    onclick: move |_| on_import_master_template.call("master-template.json".to_string()),
                    "Load Template Stub"
                }
            }
        }
    }
}

#[component]
fn WorkbenchCard(
    item: WorkbenchItem,
    absolute_index: usize,
    centered: bool,
    selected: bool,
    on_set_center: EventHandler<usize>,
    on_toggle_select: EventHandler<u64>,
    on_set_master: EventHandler<u64>,
    mode: WorkspaceMode,
) -> Element {
    let title = if item.packet.forge.title.trim().is_empty() {
        "Untitled Packet".to_string()
    } else {
        item.packet.forge.title.clone()
    };
    let description = truncate_words(&item.packet.forge.description, 18);
    let initials = initials_from_name(&item.packet.artwork.file_name);
    rsx! {
        article {
            class: "mq-card",
            "data-centered": if centered { "true" } else { "false" },
            "data-active": if centered { "true" } else { "false" },
            "data-selected": if selected { "true" } else { "false" },
            onclick: move |_| on_set_center.call(absolute_index),
            div { class: "mq-card-preview",
                if let Some(url) = item.preview_url.as_deref() {
                    img { src: "{url}", alt: "{item.packet.artwork.file_name}" }
                } else {
                    div { class: "mq-preview-fallback",
                        strong { "{initials}" }
                        span { "{item.packet.artwork.file_name}" }
                    }
                }
            }
            h4 { "{title}" }
            p { "{description}" }
            div { class: "mq-chip-row",
                span { class: "mq-chip", "#{item.client_id}" }
                span { class: "mq-chip", "{item.source_label}" }
                if item.is_master_template {
                    span { class: "mq-chip mq-chip--active", "Master" }
                }
            }
            div { class: "mq-card-actions",
                if mode == WorkspaceMode::Edit {
                    button {
                        class: "mq-button mq-button--green",
                        onclick: move |_| on_toggle_select.call(item.client_id),
                        if selected { "Deselect" } else { "Select" }
                    }
                } else {
                    button {
                        class: "mq-button mq-button--purple",
                        onclick: move |_| on_set_master.call(item.client_id),
                        "Set Master"
                    }
                }
            }
        }
    }
}

impl PartialEq for WorkbenchItem {
    fn eq(&self, other: &Self) -> bool {
        self.client_id == other.client_id
    }
}

async fn collect_imported_images(files: Option<Arc<dyn FileEngine>>) -> Vec<ImportedImageStub> {
    let Some(files) = files else {
        return Vec::new();
    };

    let mut imports = Vec::new();

    for name in files.files() {
        let Some(mime_hint) = accepted_image_mime(&name) else {
            continue;
        };

        let preview_url = match files.read_file(&name).await {
            Some(bytes) if !bytes.is_empty() => Some(format!(
                "data:{};base64,{}",
                mime_hint,
                STANDARD.encode(bytes)
            )),
            _ => Some(fallback_preview_url(&name)),
        };

        imports.push(ImportedImageStub {
            file_name: basename(&name),
            preview_url,
            mime_hint: Some(mime_hint.to_string()),
        });
    }

    imports
}

fn accepted_image_mime(name: &str) -> Option<&'static str> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".png") {
        Some("image/png")
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        Some("image/jpeg")
    } else {
        None
    }
}

fn fallback_preview_url(name: &str) -> String {
    format!("blob:contextquantum/{}", sanitize_token(name))
}

fn sanitize_token(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
}

fn basename(name: &str) -> String {
    name.rsplit(['\\', '/'])
        .next()
        .unwrap_or(name)
        .to_string()
}

fn visible_window(
    items: &[WorkbenchItem],
    center: usize,
    slots: usize,
) -> Vec<(usize, Option<WorkbenchItem>)> {
    if items.is_empty() {
        return (0..slots).map(|index| (index, None)).collect();
    }

    let half = slots / 2;
    let mut start = center.saturating_sub(half);
    let mut end = (start + slots).min(items.len());

    if end - start < slots {
        start = end.saturating_sub(slots.min(items.len()));
        end = (start + slots).min(items.len());
    }

    let mut rendered = items[start..end]
        .iter()
        .cloned()
        .enumerate()
        .map(|(offset, item)| (start + offset, Some(item)))
        .collect::<Vec<_>>();

    while rendered.len() < slots {
        rendered.push((items.len() + rendered.len(), None));
    }

    rendered
}

fn truncate_words(input: &str, limit: usize) -> String {
    let words = input.split_whitespace().collect::<Vec<_>>();
    if words.is_empty() {
        return "Metadata preview pending.".to_string();
    }
    if words.len() <= limit {
        input.to_string()
    } else {
        format!("{}...", words[..limit].join(" "))
    }
}

fn initials_from_name(name: &str) -> String {
    let letters = basename(name)
        .chars()
        .filter(|ch| ch.is_ascii_alphabetic())
        .take(2)
        .collect::<String>();

    if letters.is_empty() {
        "MQ".to_string()
    } else {
        letters.to_ascii_uppercase()
    }
}
