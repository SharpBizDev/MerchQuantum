use crate::models::*;
use crate::router::OrderRouter;
use crate::ui::carousel::{
    BatchMetadataDraft, ImportedImageStub, PipelineCommand, PipelinePhase, PipelineStatus,
    QuantumCarousel, WorkbenchItem, WorkspaceMode,
};
use crate::vault::QuantumVault;
use crate::APP_RUNTIME;
use dioxus::prelude::*;
use futures_util::StreamExt;
use std::collections::BTreeSet;
use std::sync::Arc;

const APP_CSS: &str = r#"
body { margin: 0; font-family: 'Segoe UI', sans-serif; background: linear-gradient(180deg, #f8f4ed, #ece4d8); color: #141414; }
.app-shell { min-height: 100vh; padding: 18px; }
.app-grid { max-width: 1500px; margin: 0 auto; display: grid; gap: 16px; }
.app-head, .panel { border: 1px solid rgba(0,0,0,.08); background: rgba(255,255,255,.86); border-radius: 24px; box-shadow: 0 18px 50px rgba(0,0,0,.08); }
.app-head { padding: 18px 20px; display: flex; justify-content: space-between; gap: 16px; align-items: center; flex-wrap: wrap; }
.title { margin: 0; font-size: clamp(1.8rem, 3vw, 2.6rem); letter-spacing: -.04em; }
.kicker { text-transform: uppercase; letter-spacing: .14em; font-size: .74rem; color: #676767; }
.sub { color: #5e625f; max-width: 70ch; }
.pillbar { display: inline-flex; background: rgba(0,0,0,.05); padding: 6px; border-radius: 999px; gap: 6px; }
.pill { border: 0; padding: 10px 15px; border-radius: 999px; background: transparent; cursor: pointer; color: #5e625f; }
.pill[data-active='true'] { background: #161616; color: white; }
.banner { padding: 14px 16px; border-radius: 18px; background: linear-gradient(90deg, rgba(12,140,98,.12), rgba(255,109,45,.12)); border: 1px solid rgba(12,140,98,.18); font-weight: 600; }
.main { display: grid; grid-template-columns: 280px minmax(0,1fr) 320px; gap: 16px; align-items: start; }
.sidebar, .inspector { padding: 18px; display: grid; gap: 14px; }
.section { display: grid; gap: 8px; }
.section h3 { margin: 0; letter-spacing: -.03em; }
.section p, .note, .steps { color: #5e625f; line-height: 1.5; }
.steps { margin: 0; padding-left: 18px; display: grid; gap: 7px; }
.stats { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 10px; }
.stat { padding: 12px; border-radius: 16px; background: rgba(255,255,255,.72); border: 1px solid rgba(0,0,0,.06); }
.stat strong { display: block; font-size: 1.3rem; letter-spacing: -.04em; }
.label { text-transform: uppercase; letter-spacing: .12em; font-size: .72rem; color: #676767; }
.actions { display: flex; flex-wrap: wrap; gap: 10px; }
.btn { border: 0; padding: 12px 15px; border-radius: 999px; cursor: pointer; }
.btn-dark { background: #161616; color: white; }
.btn-soft { background: rgba(12,140,98,.14); color: #0a6b4c; }
.note { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.74); border: 1px solid rgba(0,0,0,.06); }
.preview { padding: 15px; border-radius: 18px; background: rgba(255,255,255,.8); border: 1px solid rgba(0,0,0,.06); display: grid; gap: 10px; }
.preview h4 { margin: 0; font-size: 1.1rem; letter-spacing: -.03em; }
.tags { display: flex; flex-wrap: wrap; gap: 8px; }
.tag { padding: 6px 9px; border-radius: 999px; background: rgba(0,0,0,.06); font-size: .82rem; }
.chip { display: inline-flex; padding: 8px 12px; border-radius: 999px; background: rgba(0,0,0,.06); font-size: .86rem; }
.chip.green { background: rgba(12,140,98,.12); color: #0a6b4c; }
.chip.orange { background: rgba(255,109,45,.12); color: #b94c1b; }
@media (max-width: 1160px) { .main { grid-template-columns: 1fr; } .sidebar, .inspector { position: static; } }
@media (max-width: 720px) { .app-shell { padding: 12px; } .stats { grid-template-columns: 1fr; } }
"#;

pub fn ContextQuantumApp() -> Element {
    let runtime = APP_RUNTIME.get().expect("runtime init required before launch");
    let vault: Arc<QuantumVault> = runtime.vault.clone();
    let router: Arc<OrderRouter> = runtime.router.clone();
    use_context_provider(move || vault.clone());
    use_context_provider(move || router.clone());

    let mut mode = use_signal(|| WorkspaceMode::Create);
    let mut items = use_signal(seed_workspace_items);
    let mut center_index = use_signal(|| 0usize);
    let mut master_template_id = use_signal(|| Some(1u64));
    let mut selected_ids = use_signal(BTreeSet::<u64>::new);
    let mut pending_imports = use_signal(Vec::<ImportedImageStub>::new);
    let mut batch_draft = use_signal(BatchMetadataDraft::default);
    let mut banner = use_signal(|| "Six clicks from template lock to one hundred listings queued.".to_string());
    let mut next_client_id = use_signal(|| 100u64);
    let mut pipeline_status = use_signal(PipelineStatus::default);

    let mut pipeline_state = pipeline_status;
    let pipeline = use_coroutine(move |mut rx: UnboundedReceiver<PipelineCommand>| async move {
        while let Some(command) = rx.next().await {
            match command {
                PipelineCommand::MasterTemplateLoaded { title } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::TemplateLocked,
                    queued_jobs: 0,
                    completed_jobs: 1,
                    blocked_jobs: 0,
                    note: format!("{title} is now the master template source."),
                }),
                PipelineCommand::ImagesStaged { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Intake,
                    queued_jobs: count,
                    completed_jobs: 0,
                    blocked_jobs: 0,
                    note: format!("{count} assets staged safely inside the browser sandbox."),
                }),
                PipelineCommand::ImagesQueued { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Drafting,
                    queued_jobs: count,
                    completed_jobs: 0,
                    blocked_jobs: 0,
                    note: format!("{count} packet drafts cloned from the master template."),
                }),
                PipelineCommand::MetadataEdited { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Review,
                    queued_jobs: count,
                    completed_jobs: count,
                    blocked_jobs: 0,
                    note: format!("Metadata sweep prepared across {count} items."),
                }),
                PipelineCommand::ReviewReady { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::ReadyToPublish,
                    queued_jobs: count,
                    completed_jobs: count,
                    blocked_jobs: 0,
                    note: format!("{count} items marked QC-approved and publish-ready."),
                }),
                PipelineCommand::PublishQueued { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Publishing,
                    queued_jobs: count,
                    completed_jobs: count,
                    blocked_jobs: 0,
                    note: format!("Publish batch armed for {count} listings."),
                }),
            }
        }
    });

    let focused_item = {
        let lib = items();
        if lib.is_empty() { None } else { lib.get(center_index().min(lib.len() - 1)).cloned() }
    };
    let focused_id = focused_item.as_ref().map(|item| item.client_id);
    let ready_count = items().iter().filter(|item| item.packet.forge.publish_ready).count();
    let qc_count = items().iter().filter(|item| item.packet.forge.qc_approved).count();

    let import_master_template = {
        let mut items = items;
        let mut master_template_id = master_template_id;
        let mut center_index = center_index;
        let mut pending_imports = pending_imports;
        let mut next_client_id = next_client_id;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        move |template_label: String| {
            let id = next_client_id();
            next_client_id.set(id + 1);
            let mut master = WorkbenchItem::from_packet(id, seed_master_packet(&template_label), "master-template".to_string());
            master.is_master_template = true;
            {
                let mut lib = items.write();
                for item in lib.iter_mut() { item.is_master_template = false; }
                lib.insert(0, master.clone());
            }
            master_template_id.set(Some(id));
            center_index.set(0);
            banner.set(format!("Master template locked: {}.", master.packet.forge.title));
            pipeline.send(PipelineCommand::MasterTemplateLoaded { title: master.packet.forge.title.clone() });
            let staged = pending_imports().clone();
            if !staged.is_empty() {
                let start = next_client_id();
                let spawned = staged_to_packets(&master.packet, &staged, start);
                next_client_id.set(start + spawned.len() as u64);
                items.write().extend(spawned);
                pending_imports.write().clear();
                pipeline.send(PipelineCommand::ImagesQueued { count: staged.len() });
            }
        }
    };

    let import_images = {
        let mut items = items;
        let mut center_index = center_index;
        let mut pending_imports = pending_imports;
        let mut next_client_id = next_client_id;
        let mut banner = banner;
        let master_template_id = master_template_id;
        let pipeline = pipeline.clone();
        move |imports: Vec<ImportedImageStub>| {
            let incoming = imports.into_iter().take(100).collect::<Vec<_>>();
            if incoming.is_empty() { return; }
            let master = master_template_id().and_then(|id| items().into_iter().find(|item| item.client_id == id));
            match master {
                Some(master_item) => {
                    let start = next_client_id();
                    let insert_at = items().len();
                    let spawned = staged_to_packets(&master_item.packet, &incoming, start);
                    next_client_id.set(start + spawned.len() as u64);
                    items.write().extend(spawned);
                    center_index.set(insert_at);
                    banner.set(format!("{} image assets hydrated into packet drafts.", incoming.len()));
                    pipeline.send(PipelineCommand::ImagesQueued { count: incoming.len() });
                }
                None => {
                    pending_imports.write().extend(incoming.clone());
                    banner.set("Images staged. Load a master template and they will materialize instantly.".to_string());
                    pipeline.send(PipelineCommand::ImagesStaged { count: incoming.len() });
                }
            }
        }
    };

    let toggle_select = {
        let mut selected_ids = selected_ids;
        move |client_id: u64| {
            let mut selection = selected_ids.write();
            if !selection.insert(client_id) { selection.remove(&client_id); }
        }
    };
    let set_center = { let mut center_index = center_index; move |index: usize| center_index.set(index) };
    let set_master_from_existing = {
        let mut items = items;
        let mut master_template_id = master_template_id;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        move |client_id: u64| {
            if let Some(item) = items().into_iter().find(|item| item.client_id == client_id) {
                {
                    let mut lib = items.write();
                    for entry in lib.iter_mut() { entry.is_master_template = entry.client_id == client_id; }
                }
                master_template_id.set(Some(client_id));
                banner.set(format!("{} is now the live master template.", item.packet.forge.title));
                pipeline.send(PipelineCommand::MasterTemplateLoaded { title: item.packet.forge.title.clone() });
            }
        }
    };
    let update_batch_title = { let mut batch_draft = batch_draft; move |value: String| batch_draft.write().title_prefix = value };
    let update_batch_description = { let mut batch_draft = batch_draft; move |value: String| batch_draft.write().description_append = value };
    let update_batch_tags = { let mut batch_draft = batch_draft; move |value: String| batch_draft.write().tags_csv = value };
    let apply_batch = {
        let mut items = items;
        let selected_ids = selected_ids;
        let batch_draft = batch_draft;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        move |_| {
            let draft = batch_draft();
            let selected = selected_ids().clone();
            if selected.is_empty() {
                banner.set("Select at least one listing in Edit Mode before applying a batch sweep.".to_string());
                return;
            }
            let mut updated = 0usize;
            {
                let mut lib = items.write();
                for item in lib.iter_mut() {
                    if selected.contains(&item.client_id) {
                        apply_batch_to_forge(&mut item.packet.forge, &draft);
                        item.dirty = true;
                        updated += 1;
                    }
                }
            }
            banner.set(format!("Metadata sweep applied across {updated} selected listings."));
            pipeline.send(PipelineCommand::MetadataEdited { count: updated });
        }
    };
    let approve_targets = {
        let mut items = items;
        let selected_ids = selected_ids;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        let focused_id = focused_id;
        move |_| {
            let targets = resolve_targets(selected_ids(), focused_id);
            if targets.is_empty() {
                banner.set("Nothing focused or selected. Center a card or select a batch first.".to_string());
                return;
            }
            let mut count = 0usize;
            {
                let mut lib = items.write();
                for item in lib.iter_mut() {
                    if targets.contains(&item.client_id) {
                        item.packet.forge.qc_approved = true;
                        item.packet.forge.publish_ready = true;
                        item.dirty = true;
                        count += 1;
                    }
                }
            }
            banner.set(format!("{count} listings moved into publish-ready state."));
            pipeline.send(PipelineCommand::ReviewReady { count });
        }
    };
    let queue_publish = {
        let selected_ids = selected_ids;
        let focused_id = focused_id;
        let items = items;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        move |_| {
            let ready_targets = resolve_targets(selected_ids(), focused_id)
                .into_iter()
                .filter(|id| items().iter().any(|item| item.client_id == *id && item.packet.forge.publish_ready))
                .collect::<Vec<_>>();
            if ready_targets.is_empty() {
                banner.set("No publish-ready targets in the current selection. Mark them ready first.".to_string());
                return;
            }
            banner.set(format!("Publish rail armed for {} listings. Backend bridge plugs in next.", ready_targets.len()));
            pipeline.send(PipelineCommand::PublishQueued { count: ready_targets.len() });
        }
    };

    let focused_summary = focused_item.as_ref().map(|item| (
        item.packet.forge.title.clone(),
        item.packet.forge.description.clone(),
        item.packet.artwork.file_name.clone(),
        item.packet.platform.price_major,
        item.packet.platform.quantity,
        item.packet.forge.tags.clone(),
        template_context_label(&item.packet.template),
    ));

    rsx! {
        style { "{APP_CSS}" }
        div { class: "app-shell",
            div { class: "app-grid",
                header { class: "app-head",
                    div {
                        div { class: "kicker", "ContextQuantum / Pure Rust Cockpit" }
                        h1 { class: "title", "ContextQuantum" }
                        p { class: "sub", "Pure Rust, pure Dioxus, browser-safe intake. The UI owns draft state while the backend engine owns routing and publish execution." }
                    }
                    div {
                        div { class: "pillbar",
                            button {
                                class: "pill",
                                "data-active": if mode() == WorkspaceMode::Create { "true" } else { "false" },
                                onclick: move |_| { mode.set(WorkspaceMode::Create); selected_ids.write().clear(); banner.set("Create Mode: template in, assets in, packets out.".to_string()); },
                                "Create Mode"
                            }
                            button {
                                class: "pill",
                                "data-active": if mode() == WorkspaceMode::Edit { "true" } else { "false" },
                                onclick: move |_| { mode.set(WorkspaceMode::Edit); banner.set("Edit Mode: multi-select, sweep metadata, queue review.".to_string()); },
                                "Edit Mode"
                            }
                        }
                    }
                }
                div { class: "banner", "{banner}" }
                main { class: "main",
                    aside { class: "panel sidebar",
                        div { class: "section",
                            h3 { "6-Click Blast Path" }
                            ol { class: "steps",
                                li { "Lock a master template." }
                                li { "Import up to 100 images." }
                                li { "Keep the focused draft centered." }
                                li { "Sweep metadata in one move." }
                                li { "Approve focused or selected items." }
                                li { "Queue publish once the rail is green." }
                            }
                        }
                        div { class: "section",
                            h3 { "Pipeline Monitor" }
                            p { "{pipeline_status().note}" }
                            div { class: "stats",
                                StatCard { label: "Queued".to_string(), value: pipeline_status().queued_jobs.to_string() }
                                StatCard { label: "Completed".to_string(), value: pipeline_status().completed_jobs.to_string() }
                                StatCard { label: "QC Ready".to_string(), value: qc_count.to_string() }
                                StatCard { label: "Publish Ready".to_string(), value: ready_count.to_string() }
                            }
                        }
                        div { class: "section",
                            h3 { "Command Rail" }
                            div { class: "actions",
                                button { class: "btn btn-soft", onclick: approve_targets, "Mark Ready" }
                                button { class: "btn btn-dark", onclick: queue_publish, "Queue Publish" }
                            }
                            p { class: "note", "The coroutine only models pipeline state here. Real publishing stays outside the render tree and can be wired to the backend bridge safely." }
                        }
                    }
                    section { class: "panel",
                        QuantumCarousel {
                            mode: mode(),
                            items,
                            center_index,
                            selected_ids,
                            master_template_id,
                            pending_imports,
                            pipeline: pipeline_status,
                            batch_draft,
                            on_set_center: set_center,
                            on_toggle_select: toggle_select,
                            on_set_master: set_master_from_existing,
                            on_import_master_template: import_master_template,
                            on_import_images: import_images,
                            on_update_batch_title: update_batch_title,
                            on_update_batch_description: update_batch_description,
                            on_update_batch_tags: update_batch_tags,
                            on_apply_batch: apply_batch,
                        }
                    }
                    aside { class: "panel inspector",
                        div { class: "section",
                            h3 { "Focused Packet" }
                            if let Some((title, description, file_name, price, quantity, tags, template_label)) = focused_summary {
                                div { class: "preview",
                                    h4 { "{title}" }
                                    div { class: "tags",
                                        span { class: "chip green", "{template_label}" }
                                        span { class: "chip", "Qty {quantity}" }
                                        span { class: "chip", "${price:.2}" }
                                    }
                                    p { class: "note", "Artwork: {file_name}" }
                                    p { class: "sub", "{description}" }
                                    div { class: "tags",
                                        for tag in tags.iter().take(6) {
                                            span { class: "tag", "#{tag}" }
                                        }
                                    }
                                }
                            } else {
                                p { class: "note", "No packet centered yet." }
                            }
                        }
                        div { class: "section",
                            h3 { "State Guarantees" }
                            p { class: "note", "Drafts are strongly typed QuantumPacket clones with ForgeOutput edits. Publish intent stays explicit and side-effect free in the UI layer." }
                            p { class: "note", "Wasm only gets user-approved file handles and in-memory previews. The backend bridge remains behind context providers and command boundaries." }
                        }
                        div { class: "section",
                            h3 { "Batch Snapshot" }
                            div { class: "tags",
                                span { class: "chip orange", "Selected: {selected_ids().len()}" }
                                span { class: "chip", "Staged: {pending_imports().len()}" }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
fn StatCard(label: String, value: String) -> Element {
    rsx! { div { class: "stat", span { class: "label", "{label}" } strong { "{value}" } } }
}

fn seed_workspace_items() -> Vec<WorkbenchItem> {
    let master = WorkbenchItem {
        client_id: 1,
        packet: seed_master_packet("Night Signal"),
        preview_url: None,
        source_label: "master-template".to_string(),
        dirty: false,
        is_master_template: true,
    };
    let assets = vec![
        ImportedImageStub::from_file_name("alpine_echo.png".to_string()),
        ImportedImageStub::from_file_name("cinder_grid.png".to_string()),
        ImportedImageStub::from_file_name("signal_veil.png".to_string()),
        ImportedImageStub::from_file_name("quiet_voltage.png".to_string()),
        ImportedImageStub::from_file_name("void_runner.png".to_string()),
    ];
    let mut packets = vec![master.clone()];
    packets.extend(staged_to_packets(&master.packet, &assets, 2));
    if let Some(item) = packets.get_mut(2) { item.packet.forge.qc_approved = true; item.packet.forge.publish_ready = true; }
    if let Some(item) = packets.get_mut(3) { item.packet.forge.qc_approved = true; }
    packets
}

fn seed_master_packet(label: &str) -> QuantumPacket {
    let pretty = humanize_file_stem(label);
    QuantumPacket {
        provider: FulfillmentProvider::Printful,
        store_id: "sandbox-core-store".to_string(),
        forge: ForgeOutput {
            title: format!("{pretty} Master Template"),
            description: format!("{pretty} is the anchor packet for high-volume metadata generation.\n\nLock the structure once and let the image queue fan out product drafts."),
            tags: vec!["streetwear".to_string(), "graphic".to_string(), "drop".to_string(), "oversized".to_string()],
            qc_approved: true,
            publish_ready: false,
        },
        artwork: ArtworkPayload {
            file_name: format!("{}_master.png", slugify(&pretty)),
            image_data_url: "memory://master-template".to_string(),
            artwork_bounds: Some(ArtworkBounds {
                canvas_width: Some(4500.0),
                canvas_height: Some(5400.0),
                visible_left: Some(450.0),
                visible_top: Some(620.0),
                visible_width: Some(3600.0),
                visible_height: Some(3980.0),
            }),
        },
        template: ProviderTemplateContext::Printful(PrintfulTemplateContext {
            thumbnail_url: None,
            placement_guide: PlacementGuide {
                position: PlacementPosition::Front,
                width: 14.0,
                height: 16.0,
                source: PlacementGuideSource::Fallback,
                decoration_method: Some("dtg".to_string()),
            },
            variants: vec![
                PrintfulSyncVariantContext {
                    variant_id: 4012,
                    retail_price: Some("39.00".to_string()),
                    options: vec![
                        PrintfulVariantOptionContext { id: Some("size".to_string()), value: Some("L".to_string()) },
                        PrintfulVariantOptionContext { id: Some("color".to_string()), value: Some("Vintage Black".to_string()) },
                    ],
                },
                PrintfulSyncVariantContext {
                    variant_id: 4013,
                    retail_price: Some("39.00".to_string()),
                    options: vec![
                        PrintfulVariantOptionContext { id: Some("size".to_string()), value: Some("XL".to_string()) },
                        PrintfulVariantOptionContext { id: Some("color".to_string()), value: Some("Vintage Black".to_string()) },
                    ],
                },
            ],
        }),
        platform: PlatformPacketContext { sku: None, quantity: 24, price_major: 39.0, mockup_urls: Vec::new(), etsy: None },
    }
}

fn staged_to_packets(master_packet: &QuantumPacket, imports: &[ImportedImageStub], start_id: u64) -> Vec<WorkbenchItem> {
    imports.iter().enumerate().map(|(offset, import)| {
        let client_id = start_id + offset as u64;
        let pretty = humanize_file_stem(&import.file_name);
        let mut packet = master_packet.clone();
        packet.artwork.file_name = import.file_name.clone();
        packet.artwork.image_data_url = import.preview_url.clone().unwrap_or_else(|| format!("memory://{}", slugify(&import.file_name)));
        packet.platform.sku = Some(format!("CQ-{client_id:05}"));
        packet.platform.mockup_urls = import.preview_url.clone().into_iter().collect();
        packet.forge.title = format!("{} / {}", master_packet.forge.title, pretty);
        packet.forge.description = format!("{}\n\nArtwork source: {}.\nBatch-generated from the locked master template.", master_packet.forge.description, import.file_name);
        packet.forge.tags = merge_tags(&master_packet.forge.tags, &[slugify(&pretty), "generated".to_string(), "contextquantum".to_string()]);
        packet.forge.qc_approved = false;
        packet.forge.publish_ready = false;
        WorkbenchItem { client_id, packet, preview_url: import.preview_url.clone(), source_label: import.file_name.clone(), dirty: true, is_master_template: false }
    }).collect()
}

fn apply_batch_to_forge(forge: &mut ForgeOutput, draft: &BatchMetadataDraft) {
    if !draft.title_prefix.trim().is_empty() && !forge.title.starts_with(draft.title_prefix.trim()) {
        forge.title = format!("{} {}", draft.title_prefix.trim(), forge.title);
    }
    if !draft.description_append.trim().is_empty() && !forge.description.contains(draft.description_append.trim()) {
        forge.description = format!("{}\n\n{}", forge.description.trim(), draft.description_append.trim());
    }
    let extra_tags = parse_tag_csv(&draft.tags_csv);
    if !extra_tags.is_empty() { forge.tags = merge_tags(&forge.tags, &extra_tags); }
}

fn resolve_targets(selection: BTreeSet<u64>, focused_id: Option<u64>) -> BTreeSet<u64> {
    if !selection.is_empty() { return selection; }
    let mut fallback = BTreeSet::new();
    if let Some(id) = focused_id { fallback.insert(id); }
    fallback
}

fn merge_tags(base: &[String], additions: &[String]) -> Vec<String> {
    let mut merged = Vec::<String>::new();
    for tag in base.iter().chain(additions.iter()) {
        let normalized = tag.trim().to_lowercase();
        if !normalized.is_empty() && !merged.iter().any(|existing| existing == &normalized) { merged.push(normalized); }
    }
    merged
}

fn parse_tag_csv(raw: &str) -> Vec<String> {
    raw.split(',').map(|tag| tag.trim().to_string()).filter(|tag| !tag.is_empty()).collect()
}

fn humanize_file_stem(raw: &str) -> String {
    let stem = raw.rsplit_once('.').map(|(left, _)| left).unwrap_or(raw);
    stem.replace(['_', '-', '.'], " ")
        .split_whitespace()
        .map(|chunk| {
            let mut chars = chunk.chars();
            match chars.next() {
                Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str().to_ascii_lowercase()),
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn slugify(raw: &str) -> String {
    raw.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

fn template_context_label(template: &ProviderTemplateContext) -> &'static str {
    match template {
        ProviderTemplateContext::Printify(_) => "Printify",
        ProviderTemplateContext::Printful(_) => "Printful",
        ProviderTemplateContext::Apliiq(_) => "Apliiq",
        ProviderTemplateContext::Gooten(_) => "Gooten",
        ProviderTemplateContext::Spreadconnect(_) => "Spreadconnect",
    }
}

