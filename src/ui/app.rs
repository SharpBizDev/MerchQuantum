use crate::models::*;
use crate::router::OrderRouter;
use crate::ui::carousel::{
    BatchMetadataDraft, ImportedImageStub, PipelineCommand, PipelinePhase, PipelineStatus,
    QuantumCarousel, WorkbenchItem, WorkspaceMode,
};
use crate::vault::QuantumVault;
use crate::APP_RUNTIME;
#[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
use dioxus::desktop::use_window;
use serde::Serialize;
use dioxus::prelude::*;
use futures_util::StreamExt;
use std::collections::{BTreeMap, BTreeSet};
use std::sync::Arc;

const APP_SHELL_CSS: &str = r#"
:root {
    --mq-bg: #0b0f19;
    --mq-text: #f3f4f6;
    --mq-muted: #9ca3af;
    --mq-purple: #8b5cf6;
    --mq-green: #10b981;
    --mq-border: rgba(255, 255, 255, 0.08);
    --mq-border-soft: rgba(255, 255, 255, 0.05);
    --mq-shadow: 0 30px 80px rgba(0, 0, 0, 0.46);
    --mq-mono: "JetBrains Mono", "Roboto Mono", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
}

* { box-sizing: border-box; }

html,
body {
    margin: 0;
    background: transparent;
}

body {
    color: var(--mq-text);
    font-family: "Inter", system-ui, sans-serif;
}

button,
input,
textarea,
select {
    font: inherit;
}

.cq-shell {
    min-height: calc(100vh - 24px);
    margin: 12px;
    overflow: hidden;
    background:
        radial-gradient(circle at top left, rgba(139, 92, 246, 0.18), transparent 24%),
        radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.08), transparent 22%),
        rgba(11, 15, 25, 0.6);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.05);
    box-shadow: var(--mq-shadow);
}

.cq-topbar {
    position: fixed;
    top: 12px;
    left: 12px;
    right: 12px;
    z-index: 50;
}

.cq-topbar-inner {
    position: relative;
    max-width: 1640px;
    margin: 0 auto;
    padding: 22px 24px 20px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(17, 24, 39, 0.8);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.34);
}

.cq-drag-handle {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 22px;
    cursor: move;
}

.cq-topbar-main {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    align-items: flex-start;
}

.cq-topbar-left,
.cq-topbar-right,
.cq-toolbar-block,
.cq-platform-row,
.cq-monitor-block,
.cq-window-controls,
.cq-inspector-actions,
.cq-chip-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}

.cq-topbar-right {
    justify-content: flex-end;
}

.cq-brand,
.cq-select-shell,
.cq-inspector-shell,
.cq-inspector-header,
.cq-field-group {
    display: grid;
    gap: 8px;
}

.cq-brand {
    min-width: 220px;
}

.project-input-monospace {
    min-height: 42px;
    width: min(100%, 320px);
    padding: 10px 12px;
    border: 1px solid rgba(139, 92, 246, 0.24);
    border-radius: 10px;
    background: rgba(11, 15, 25, 0.72);
    color: #e5e7eb;
    font-family: var(--mq-mono);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
}

.project-input-monospace:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.16), 0 0 10px rgba(139, 92, 246, 0.18);
}

.cq-kicker,
.cq-select-shell label,
.cq-field-group label,
.cq-monitor-label,
.cq-panel-label {
    color: var(--mq-muted);
    font-family: var(--mq-mono);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
}

.cq-title {
    margin: 0;
    font-size: 1.2rem;
    letter-spacing: -0.03em;
}

.cq-subtitle {
    margin: 0;
    color: var(--mq-muted);
    font-size: 0.9rem;
    max-width: 38ch;
}

.cq-segment {
    display: inline-flex;
    gap: 6px;
    padding: 6px;
    border-radius: 999px;
    border: 1px solid var(--mq-border);
    background: rgba(255, 255, 255, 0.03);
}

.cq-segment-button,
.cq-control,
.cq-select,
.cq-input,
.cq-textarea,
.cq-window-control,
.cq-platform-toggle,
.cq-quantum-switch {
    border-radius: 8px;
    border: 1px solid var(--mq-border);
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.04);
    color: var(--mq-text);
}

.cq-segment-button,
.cq-control,
.cq-window-control,
.cq-orb-action,
.cq-select,
.cq-input,
.cq-textarea,
.cq-platform-toggle,
.cq-quantum-switch,
.cq-monitor-tile,
.cq-banner,
.cq-stage-panel,
.cq-inspector,
.cq-note,
.cq-empty-inspector,
.cq-chip {
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.cq-segment-button {
    min-height: 42px;
    padding: 0 14px;
    border-radius: 999px;
    background: transparent;
    color: var(--mq-muted);
}

.cq-segment-button[data-active='true'] {
    background: var(--mq-purple);
    color: #ffffff;
    border-color: rgba(139, 92, 246, 0.5);
    box-shadow: 0 0 0 1px rgba(139, 92, 246, 0.18), 0 12px 32px rgba(139, 92, 246, 0.24);
}

.cq-control,
.cq-select {
    min-height: 44px;
    padding: 0 14px;
}

.cq-select {
    min-width: 180px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(11, 15, 25, 0.72);
}

.cq-control:hover,
.cq-segment-button:hover,
.cq-window-control:hover,
.cq-platform-toggle:hover,
.cq-quantum-switch:hover {
    transform: translateY(-1px);
}

.cq-control--secondary {
    background: rgba(255, 255, 255, 0.05);
}

.cq-control--success {
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.32);
    color: #d1fae5;
}

.cq-monitor-tile {
    min-width: 92px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid var(--mq-border);
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.04);
    display: grid;
    gap: 4px;
}

.cq-monitor-value {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #e5e7eb;
}

.cq-orb-action {
    width: 76px;
    height: 76px;
    border-radius: 999px;
    border: 1px solid rgba(139, 92, 246, 0.42);
    background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.18), rgba(139, 92, 246, 0.28) 34%, rgba(11, 15, 25, 0.96) 72%);
    color: #f3f4f6;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font-size: 0.64rem;
    box-shadow: 0 0 15px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.2) inset;
    transition: all 0.3s ease;
}

.cq-orb-action:hover {
    box-shadow: 0 0 30px rgba(139, 92, 246, 0.85), 0 0 0 1px rgba(139, 92, 246, 0.28) inset;
    transform: scale(1.04);
}

.cq-orb-action[data-armed='false'] {
    opacity: 0.72;
}

.cq-orb-action[data-pulse='true'] {
    animation: quantum-pulse 1.8s ease-in-out infinite;
}

.cq-window-control {
    width: 38px;
    height: 38px;
    display: grid;
    place-items: center;
}

.cq-window-control:hover {
    box-shadow: 0 0 18px rgba(139, 92, 246, 0.28), 0 0 0 1px rgba(139, 92, 246, 0.18) inset;
}

.cq-window-control--close:hover {
    background: rgba(239, 68, 68, 0.18);
    border-color: rgba(239, 68, 68, 0.28);
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.32);
}

.cq-toolbar-block {
    gap: 12px;
}

.cq-select-shell[data-focus='true'] {
    position: relative;
    z-index: 3;
}

.cq-platform-matrix {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    min-width: 320px;
    border-radius: 12px;
    border: 1px solid var(--mq-border);
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.04);
}

.cq-platform-matrix[data-quantum='true'] {
    border-color: rgba(139, 92, 246, 0.42);
    box-shadow: inset 0 0 24px rgba(139, 92, 246, 0.24), 0 0 26px rgba(139, 92, 246, 0.18);
}

.cq-platform-row {
    gap: 8px;
}

.cq-platform-toggle,
.cq-quantum-switch {
    min-height: 42px;
    padding: 0 14px;
}

.cq-platform-toggle[data-active='true'],
.cq-platform-matrix[data-quantum='true'] .cq-platform-toggle {
    background: rgba(139, 92, 246, 0.4);
    border-color: rgba(139, 92, 246, 0.54);
    box-shadow: inset 0 0 10px #8b5cf6;
    color: #ffffff;
}

.cq-quantum-switch {
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
}

.cq-quantum-switch[data-active='true'] {
    background:
        linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(139, 92, 246, 0.36)),
        rgba(255, 255, 255, 0.04);
    border-color: rgba(239, 68, 68, 0.32);
    box-shadow: 0 0 22px rgba(139, 92, 246, 0.32);
    animation: cq-quantum-pulse 1.8s ease-in-out infinite;
}

.cq-workbench {
    max-width: 1640px;
    margin: 0 auto;
    padding: 122px 20px 24px;
    display: grid;
    gap: 16px;
    transition: padding-right 180ms ease;
}

.cq-workbench[data-inspector='true'] {
    padding-right: 404px;
}

.cq-banner,
.cq-stage-panel,
.cq-inspector,
.cq-empty-inspector {
    border-radius: 16px;
    border: 1px solid var(--mq-border-soft);
}

.cq-banner {
    padding: 14px 16px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(139, 92, 246, 0.1);
    font-weight: 600;
}

.log-terminal {
    display: grid;
    gap: 8px;
    padding: 16px 18px;
    border-radius: 16px;
    border: 1px solid var(--mq-border-soft);
    background:
        linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
        rgba(7, 10, 18, 0.78);
    font-family: var(--mq-mono);
}

.log-terminal p {
    margin: 0;
    color: #d1d5db;
    font-size: 12px;
    letter-spacing: 0.05em;
    line-height: 1.6;
}

.cq-stage-panel {
    min-width: 0;
    padding: 18px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(17, 24, 39, 0.46);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
}

.cq-inspector {
    position: fixed;
    top: 122px;
    right: 20px;
    width: 360px;
    max-height: calc(100vh - 144px);
    overflow: auto;
    padding: 22px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(17, 24, 39, 0.4);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.cq-inspector-title {
    margin: 0;
    font-size: 1.14rem;
    letter-spacing: -0.03em;
}

.cq-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--mq-border);
    color: var(--mq-text);
    font-size: 0.83rem;
}

.cq-chip--green {
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.3);
    color: #d1fae5;
}

.cq-chip--purple {
    background: rgba(139, 92, 246, 0.14);
    border-color: rgba(139, 92, 246, 0.3);
    color: #ede9fe;
}

.cq-input,
.cq-textarea {
    width: 100%;
    padding: 12px 13px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03)),
        rgba(11, 15, 25, 0.76);
}

.cq-textarea {
    min-height: 138px;
    resize: vertical;
}

.cq-note {
    padding: 12px 14px;
    border-radius: 10px;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    color: var(--mq-muted);
    line-height: 1.55;
}

.refinement-panel {
    display: grid;
    gap: 18px;
}

.cyan-accent {
    margin: 0;
    color: #00ffcc;
    font-family: var(--mq-mono);
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.forge-ignite-button {
    background: #ff0055;
    border: 1px solid #fff;
    color: #fff;
    font-weight: bold;
    font-family: 'Monospace';
    padding: 10px;
    width: 100%;
    margin-top: 20px;
    cursor: pointer;
}

.forge-ignite-button:hover {
    background: #fff;
    color: #ff0055;
}

.cq-empty-inspector {
    padding: 18px;
    color: var(--mq-muted);
    line-height: 1.55;
    background:
        linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05)),
        rgba(255, 255, 255, 0.02);
}

.cq-provider-overlay {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: start center;
    padding-top: 108px;
    background: rgba(5, 8, 16, 0.6);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    pointer-events: none;
}

.cq-provider-overlay-card {
    padding: 14px 18px;
    border-radius: 14px;
    border: 1px solid rgba(139, 92, 246, 0.32);
    background:
        linear-gradient(135deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05)),
        rgba(17, 24, 39, 0.86);
    color: var(--mq-text);
    box-shadow: 0 0 24px rgba(139, 92, 246, 0.22);
}

@keyframes cq-orb-hue {
    0% { filter: hue-rotate(0deg); }
    100% { filter: hue-rotate(360deg); }
}

@keyframes cq-quantum-pulse {
    0%, 100% {
        box-shadow: 0 0 18px rgba(139, 92, 246, 0.24);
        transform: translateY(0);
    }

    50% {
        box-shadow: 0 0 26px rgba(239, 68, 68, 0.24), 0 0 34px rgba(139, 92, 246, 0.32);
        transform: translateY(-1px);
    }
}

@keyframes quantum-pulse {
    0%, 100% {
        filter: hue-rotate(0deg);
        box-shadow: 0 0 15px rgba(139, 92, 246, 0.6), 0 0 0 1px rgba(139, 92, 246, 0.2) inset;
    }

    50% {
        filter: hue-rotate(-42deg);
        box-shadow: 0 0 26px rgba(220, 38, 38, 0.58), 0 0 34px rgba(139, 92, 246, 0.42), 0 0 0 1px rgba(220, 38, 38, 0.24) inset;
    }
}


.cq-status-rail {
    position: fixed;
    top: 12px;
    left: 12px;
    bottom: 12px;
    width: 64px;
    z-index: 55;
    display: grid;
    align-content: start;
    gap: 14px;
    padding: 20px 8px;
    background: rgba(11, 15, 25, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-right: 1px solid rgba(139, 92, 246, 0.2);
    border-radius: 16px;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
}

.cq-status-stack {
    display: grid;
    gap: 14px;
    justify-items: center;
}

.cq-status-node {
    display: grid;
    gap: 6px;
    justify-items: center;
    color: var(--mq-muted);
}

.cq-status-orb {
    width: 12px;
    height: 12px;
    border-radius: 999px;
    background: #8b5cf6;
    box-shadow: 0 0 14px rgba(139, 92, 246, 0.48);
}

.cq-status-node[data-active='true'] .cq-status-orb {
    background: #10b981;
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.52);
}

.cq-status-label,
.cq-select-shell label,
.cq-field-group label,
.cq-panel-label,
.cq-monitor-label {
    font-family: var(--mq-mono);
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.6;
}

.cq-status-label {
    font-size: 10px;
    opacity: 0.6;
}

.cq-input,
.cq-textarea,
.cq-select,
.cq-chip,
.cq-monitor-value {
    font-family: var(--mq-mono);
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.05em;
    color: #e5e7eb;
}

.cq-inspector {
    animation: cq-inspector-shift 150ms cubic-bezier(0.4, 0, 0.2, 1) both;
}

.cq-inspector-shell {
    gap: 32px;
}

.cq-field-group {
    gap: 12px;
    padding-bottom: 32px;
}

.cq-field-group:last-of-type {
    padding-bottom: 0;
}

.cq-template-deck {
    display: grid;
    gap: 14px;
}

.cq-template-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.template-pill {
    background: #1a1a1a;
    border: 1px solid #00ffcc;
    color: #00ffcc;
    padding: 4px 10px;
    cursor: pointer;
    font-family: 'Monospace';
    font-size: 0.75rem;
    margin-right: 5px;
}

.template-pill:hover {
    background: #00ffcc;
    color: #000;
}

.cq-input,
.cq-textarea {
    border: 0;
    border-bottom: 1px solid rgba(139, 92, 246, 0.3);
    border-radius: 0;
    padding: 0 0 14px;
    background: transparent;
    box-shadow: none;
}

.cq-input:focus,
.cq-textarea:focus {
    outline: none;
    border-bottom-color: #8b5cf6;
    box-shadow: 0 0 5px rgba(139, 92, 246, 0.72);
}

.cq-input::placeholder,
.cq-textarea::placeholder {
    color: rgba(156, 163, 175, 0.58);
}


.cq-topbar {
    left: 92px;
}

.cq-workbench {
    padding: 122px 20px 24px 104px;
    transition: padding-right 180ms ease, padding-left 180ms ease;
}

.cq-workbench[data-inspector='true'] {
    padding-right: 404px;
    padding-left: 104px;
}
@keyframes cq-inspector-shift {
    0% {
        opacity: 0;
        transform: translateX(14px);
    }

    100% {
        opacity: 1;
        transform: translateX(0);
    }
}
@media (max-width: 1320px) {
    .cq-workbench[data-inspector='true'] { padding-right: 20px; padding-left: 92px; }
    .cq-inspector { position: static; width: auto; max-height: none; }
}

@media (max-width: 920px) {
    .cq-topbar { left: 80px; }
    .cq-topbar-main { display: grid; }
    .cq-topbar-right { justify-content: flex-start; }
    .cq-workbench { padding: 196px 20px 24px 92px; }
    .cq-status-rail { width: 56px; padding: 18px 6px; }
}

@media (max-width: 720px) {
    .cq-shell { margin: 8px; min-height: calc(100vh - 16px); }
    .cq-topbar { top: 8px; left: 72px; right: 8px; }
    .cq-workbench { padding: 206px 12px 20px 80px; }
    .cq-status-rail { left: 8px; top: 8px; bottom: 8px; width: 52px; }
}
"#;

const PROVIDER_OPTIONS: [&str; 3] = ["Printful", "Gooten", "Apliiq"];
const SHOP_OPTIONS: [&str; 3] = [
    "context-quantum-drafts",
    "night-signal-store",
    "evergreen-launch-bay",
];
const PLATFORM_OPTIONS: [&str; 6] = ["Amazon", "Etsy", "eBay", "TikTok", "Walmart", "Meta"];

pub fn ContextQuantumApp() -> Element {
    let runtime = APP_RUNTIME.get().expect("Runtime init");
    let vault: Arc<QuantumVault> = runtime.vault.clone();
    let router: Arc<OrderRouter> = runtime.router.clone();
    use_context_provider(move || vault.clone());
    use_context_provider(move || router.clone());

    #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
    let desktop = use_window();

    let persisted_state = QuantumState::load();
    let persisted_connections = persisted_state.connections.clone();
    let persisted_project_name = if persisted_state.project_name.trim().is_empty() {
        "ContextQuantum_Alpha".to_string()
    } else {
        persisted_state.project_name.clone()
    };
    let persisted_provider = persisted_connection_value(&persisted_connections, "provider:")
        .unwrap_or_else(|| "Printful".to_string());
    let persisted_shop = persisted_connection_value(&persisted_connections, "shop:")
        .unwrap_or_else(|| "context-quantum-drafts".to_string());
    let persisted_mode = persisted_workspace_mode(&persisted_connections);
    let persisted_platforms = persisted_platform_set(&persisted_connections);
    let persisted_quantum_blast = persisted_connections.iter().any(|entry| entry == "quantum_blast:armed");
    let persisted_selected_asset_id = persisted_state
        .selected_asset_id
        .as_deref()
        .and_then(|value| value.parse::<u64>().ok());
    let persisted_templates = if persisted_state.templates.is_empty() {
        vec![default_metadata_template()]
    } else {
        persisted_state.templates.clone()
    };
    let saved_templates = persisted_templates.clone();

    let project_name = use_signal(|| persisted_project_name.clone());
    let mode = use_signal(|| persisted_mode);
    let items = use_signal(seed_workspace_items);
    let center_index = use_signal(|| 0usize);
    let active_card_id = use_signal(|| persisted_selected_asset_id);
    let master_template_id = use_signal(|| Some(1u64));
    let selected_ids = use_signal(BTreeSet::<u64>::new);
    let pending_imports = use_signal(seed_pending_imports);
    let batch_draft = use_signal(BatchMetadataDraft::default);
    let banner = use_signal(|| {
        persisted_state
            .logs
            .first()
            .cloned()
            .unwrap_or_else(|| "Drop images or click-import to stage your next batch.".to_string())
    });
    let pipeline_status = use_signal(PipelineStatus::default);
    let selected_provider = use_signal(|| persisted_provider.clone());
    let shop_choice = use_signal(|| persisted_shop.clone());
    let active_platforms = use_signal(|| persisted_platforms.clone());
    let quantum_blast = use_signal(|| persisted_quantum_blast);

    let mut pipeline_state = pipeline_status;
    let pipeline = use_coroutine(move |mut rx: UnboundedReceiver<PipelineCommand>| async move {
        while let Some(cmd) = rx.next().await {
            match cmd {
                PipelineCommand::ImagesStaged { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Intake,
                    queued_jobs: count,
                    completed_jobs: 0,
                    blocked_jobs: 0,
                    note: format!("{count} image assets staged for template fan-out."),
                }),
                PipelineCommand::PublishQueued { count } => pipeline_state.set(PipelineStatus {
                    phase: PipelinePhase::Publishing,
                    queued_jobs: count,
                    completed_jobs: count,
                    blocked_jobs: 0,
                    note: format!("Publish armed for {count} listings."),
                }),
            }
        }
    });

    use_effect({
        let mut active_platforms = active_platforms;
        let quantum_blast = quantum_blast;
        move || {
            if quantum_blast() {
                let mut platforms = active_platforms.write();
                let needs_sync = platforms.len() != PLATFORM_OPTIONS.len()
                    || PLATFORM_OPTIONS.iter().any(|platform| !platforms.contains(*platform));
                if needs_sync {
                    platforms.clear();
                    for platform in PLATFORM_OPTIONS {
                        platforms.insert(platform.to_string());
                    }
                }
            }
        }
    });

    use_effect({
        let mode = mode;
        let items = items;
        let active_card_id = active_card_id;
        let master_template_id = master_template_id;
        let selected_ids = selected_ids;
        let pending_imports = pending_imports;
        let banner = banner;
        let pipeline_status = pipeline_status;
        let selected_provider = selected_provider;
        let shop_choice = shop_choice;
        let active_platforms = active_platforms;
        let quantum_blast = quantum_blast;
        let project_name = project_name;
        move || {
            let pipeline = pipeline_status();
            let item_snapshot = items();
            let snapshot = QuantumState {
                project_name: project_name(),
                connections: build_quantum_connections(
                    mode(),
                    &selected_provider(),
                    &shop_choice(),
                    &active_platforms(),
                    quantum_blast(),
                    active_card_id(),
                    master_template_id(),
                ),
                logs: build_quantum_logs(
                    &banner(),
                    &pipeline,
                    item_snapshot.len(),
                    pending_imports().len(),
                    selected_ids().len(),
                ),
                assets: build_quantum_assets(&item_snapshot),
                selected_asset_id: active_card_id().map(|id| id.to_string()),
                templates: saved_templates.clone(),
            };
            snapshot.save();
        }
    });

    let library_snapshot = items();
    let active_item = active_card_id().and_then(|target_id| {
        library_snapshot
            .iter()
            .find(|item| item.client_id == target_id)
            .cloned()
    });

    let queue_publish = {
        let mut banner = banner;
        let pipeline = pipeline.clone();
        let selected_provider = selected_provider;
        let active_platforms = active_platforms;
        let items = items;
        move |_| {
            let provider = selected_provider();
            if provider.trim().is_empty() {
                banner.set("Choose a Provider Valve before firing the Omni-Blast rail.".to_string());
                return;
            }

            let platforms = active_platforms().iter().cloned().collect::<Vec<_>>();
            if platforms.is_empty() {
                banner.set("Select at least one target platform before forging the payload matrix.".to_string());
                return;
            }

            let workbench = items();
            if workbench.is_empty() {
                banner.set("No hydrated items are available for dispatch yet.".to_string());
                return;
            }

            let ready_items = workbench
                .iter()
                .filter(|item| item.packet.forge.publish_ready)
                .cloned()
                .collect::<Vec<_>>();
            if ready_items.is_empty() {
                banner.set("No publish-ready items are armed for the Omni-Blast queue yet.".to_string());
                return;
            }

            let payload = build_omni_payload(&platforms, &provider, &ready_items);
            let item_count = ready_items.len();
            let platform_count = platforms.len();
            let first_metadata = payload
                .values()
                .find_map(|metadata| metadata.first())
                .cloned();

            banner.set(format!(
                "Quantum blast queued for {} ready item(s) across {} platform(s).",
                item_count,
                platform_count
            ));
            pipeline.send(PipelineCommand::PublishQueued { count: item_count });

            let provider_clone = provider.clone();
            let payload_clone = payload.clone();
            let platforms_clone = platforms.clone();

            if let Ok(handle) = tokio::runtime::Handle::try_current() {
                handle.spawn(async move {
                    println!("BLASTING {} ITEMS TO {} PLATFORMS.", item_count, platform_count);
                    if let Some(metadata) = first_metadata.as_ref() {
                        match serde_json::to_string_pretty(metadata) {
                            Ok(serialized) => println!(
                                "BLAST_SAMPLE provider={} first_platform={} metadata={}\nfull_platforms={:?}",
                                provider_clone,
                                platforms_clone.first().map(String::as_str).unwrap_or("none"),
                                serialized,
                                payload_clone.keys().cloned().collect::<Vec<_>>()
                            ),
                            Err(error) => println!(
                                "BLAST_SAMPLE provider={} serialization_error={} metadata={:?}",
                                provider_clone,
                                error,
                                metadata
                            ),
                        }
                    }
                });
            } else {
                println!("BLASTING {} ITEMS TO {} PLATFORMS.", item_count, platform_count);
                if let Some(metadata) = first_metadata.as_ref() {
                    match serde_json::to_string_pretty(metadata) {
                        Ok(serialized) => println!(
                            "BLAST_SAMPLE provider={} first_platform={} metadata={}\nfull_platforms={:?}",
                            provider,
                            platforms.first().map(String::as_str).unwrap_or("none"),
                            serialized,
                            payload.keys().cloned().collect::<Vec<_>>()
                        ),
                        Err(error) => println!(
                            "BLAST_SAMPLE provider={} serialization_error={} metadata={:?}",
                            provider,
                            error,
                            metadata
                        ),
                    }
                }
            }
        }
    };

    let mut toggle_platform = {
        let mut active_platforms = active_platforms;
        let mut quantum_blast = quantum_blast;
        move |platform: String| {
            let was_quantum = quantum_blast();
            let mut platforms = active_platforms.write();
            let was_active = platforms.contains(&platform);

            if was_quantum && was_active {
                quantum_blast.set(false);
            }

            if !platforms.insert(platform.clone()) {
                platforms.remove(&platform);
            }
        }
    };

    let toggle_quantum_blast = {
        let mut quantum_blast = quantum_blast;
        let mut active_platforms = active_platforms;
        move |_| {
            let next = !quantum_blast();
            quantum_blast.set(next);
            let mut platforms = active_platforms.write();
            platforms.clear();
            if next {
                for platform in PLATFORM_OPTIONS {
                    platforms.insert(platform.to_string());
                }
            }
        }
    };

    let import_master_template = {
        let mut banner = banner;
        let mut active_card_id = active_card_id;
        let mut center_index = center_index;
        move |_| {
            active_card_id.set(Some(1));
            center_index.set(0);
            banner.set("Master template stub armed in the cockpit rail.".to_string());
        }
    };

    let import_images = {
        let mut items = items;
        let master_template_id = master_template_id;
        let mut center_index = center_index;
        let mut active_card_id = active_card_id;
        let mut pending_imports = pending_imports;
        let mut banner = banner;
        let pipeline = pipeline.clone();
        move |imports: Vec<ImportedImageStub>| {
            #[cfg(target_arch = "wasm32")]
            let accepted = {
                let accepted = imports.into_iter().filter(|item| item.mime_hint.is_some()).take(100).collect::<Vec<_>>();
                if accepted.is_empty() { wasm_demo_payload() } else { accepted }
            };
            #[cfg(not(target_arch = "wasm32"))]
            let accepted = imports.into_iter().filter(|item| item.mime_hint.is_some()).take(100).collect::<Vec<_>>();
            let count = accepted.len();
            if count == 0 {
                banner.set("No compatible PNG/JPG files were detected in the dropped batch.".to_string());
                return;
            }

            let existing_items = items();
            let first_new_index = existing_items.len();
            let starting_client_id = existing_items.iter().map(|item| item.client_id).max().unwrap_or(0) + 1;
            let master_packet = resolve_master_packet(&existing_items, master_template_id());
            let hydrated_items = hydrate_imported_items(&accepted, master_packet.as_ref(), starting_client_id);
            let first_new_id = hydrated_items.first().map(|item| item.client_id);

            pending_imports.write().extend(accepted);
            items.write().extend(hydrated_items);
            center_index.set(first_new_index);
            active_card_id.set(first_new_id);
            banner.set(format!("{count} images hydrated into live workbench items."));
            pipeline.send(PipelineCommand::ImagesStaged { count });
        }
    };

    let focus_card = {
        let items = items;
        let mut center_index = center_index;
        let mut active_card_id = active_card_id;
        move |index: usize| {
            let snapshot = items();
            if let Some(item) = snapshot.get(index) {
                center_index.set(index);
                active_card_id.set(Some(item.client_id));
            }
        }
    };

    let toggle_select = {
        let mut selected_ids = selected_ids;
        let mut active_card_id = active_card_id;
        move |id: u64| {
            active_card_id.set(Some(id));
            let mut selected = selected_ids.write();
            if !selected.insert(id) {
                selected.remove(&id);
            }
        }
    };

    let set_master = {
        let mut items = items;
        let mut master_template_id = master_template_id;
        let mut active_card_id = active_card_id;
        move |id: u64| {
            master_template_id.set(Some(id));
            active_card_id.set(Some(id));
            for item in items.write().iter_mut() {
                item.is_master_template = item.client_id == id;
            }
        }
    };

    let _update_active_title = {
        let items = items;
        let active_card_id = active_card_id;
        move |value: String| mutate_active_item(items, active_card_id(), move |item| {
            item.packet.forge.title = value.clone();
            item.dirty = true;
        })
    };

    let _update_active_description = {
        let items = items;
        let active_card_id = active_card_id;
        move |value: String| mutate_active_item(items, active_card_id(), move |item| {
            item.packet.forge.description = value.clone();
            item.dirty = true;
        })
    };

    let _update_active_tags = {
        let items = items;
        let active_card_id = active_card_id;
        move |value: String| mutate_active_item(items, active_card_id(), move |item| {
            item.packet.forge.tags = parse_tags_csv(&value);
            item.dirty = true;
        })
    };

    let apply_batch = {
        let mut items = items;
        let selected_ids = selected_ids;
        let active_card_id = active_card_id;
        let batch_draft = batch_draft;
        let mut banner = banner;
        move |_| {
            let targets = if !selected_ids().is_empty() {
                selected_ids().clone()
            } else {
                let mut single = BTreeSet::new();
                if let Some(id) = active_card_id() {
                    single.insert(id);
                }
                single
            };

            if targets.is_empty() {
                banner.set("Select a listing before forging metadata.".to_string());
                return;
            }

            let draft = batch_draft();
            let draft_tags = parse_tags_csv(&draft.tags_csv);
            let mut updated = 0usize;

            for item in items.write().iter_mut() {
                if !targets.contains(&item.client_id) {
                    continue;
                }

                if !draft.title_prefix.trim().is_empty() {
                    let prefix = draft.title_prefix.trim();
                    item.packet.forge.title = format!("{prefix} {}", item.packet.forge.title.trim());
                }

                if !draft.description_append.trim().is_empty() {
                    let patch = draft.description_append.trim();
                    if item.packet.forge.description.trim().is_empty() {
                        item.packet.forge.description = patch.to_string();
                    } else {
                        item.packet.forge.description = format!("{}\n\n{}", item.packet.forge.description.trim(), patch);
                    }
                }

                if !draft_tags.is_empty() {
                    item.packet.forge.tags = merge_tags(&item.packet.forge.tags, &draft_tags);
                }

                item.dirty = true;
                updated += 1;
            }

            banner.set(format!("Forged metadata across {updated} listings."));
        }
    };

    let handle_refinement_change = {
        let items = items;
        let active_card_id = active_card_id;
        move |asset: crate::models::Asset| mutate_active_item(items, active_card_id(), move |item| {
            apply_asset_to_workbench_item(item, &asset);
        })
    };

    let drag_window = {
        #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
        {
            let desktop = desktop.clone();
            move |_| desktop.drag()
        }
        #[cfg(any(not(feature = "desktop"), target_arch = "wasm32"))]
        {
            move |_| {}
        }
    };
    let minimize_window = {
        #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
        {
            let desktop = desktop.clone();
            move |_| desktop.set_minimized(true)
        }
        #[cfg(any(not(feature = "desktop"), target_arch = "wasm32"))]
        {
            move |_| {}
        }
    };
    let toggle_maximize = {
        #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
        {
            let desktop = desktop.clone();
            move |_| desktop.set_maximized(!desktop.is_maximized())
        }
        #[cfg(any(not(feature = "desktop"), target_arch = "wasm32"))]
        {
            move |_| {}
        }
    };
    let close_window = {
        #[cfg(all(feature = "desktop", not(target_arch = "wasm32")))]
        {
            let desktop = desktop.clone();
            move |_| desktop.close()
        }
        #[cfg(any(not(feature = "desktop"), target_arch = "wasm32"))]
        {
            move |_| {}
        }
    };

    let inspector_visible = active_item.is_some();
    let provider_missing = selected_provider().trim().is_empty();
    let mut project_name_input = project_name;
    let mut selected_provider_input = selected_provider;
    let mut shop_choice_input = shop_choice;
    let mut mode_create = mode;
    let mut mode_edit = mode;
    let mut batch_title_draft = batch_draft;
    let mut batch_description_draft = batch_draft;
    let mut batch_tags_draft = batch_draft;
    let mut set_master_action = set_master;
    let mut toggle_select_action = toggle_select;
    let blast_armed = !provider_missing && !active_platforms().is_empty() && !library_snapshot.is_empty();
    let orb_pulse = !active_platforms().is_empty();
    let forge_logs = build_quantum_logs(
        &banner(),
        &pipeline_status(),
        library_snapshot.len(),
        pending_imports().len(),
        selected_ids().len(),
    );
    let active_asset = active_item.as_ref().map(asset_from_workbench_item);

    rsx! {
        style { "{APP_SHELL_CSS}" }
        if provider_missing {
            div { class: "cq-provider-overlay",
                div { class: "cq-provider-overlay-card", "Select the Provider Valve to unlock the Nuclear Forge." }
            }
        }
        div { class: "cq-shell",
            aside { class: "cq-status-rail",
                div { class: "cq-status-stack",
                    for platform in PLATFORM_OPTIONS {
                        StatusRailNode {
                            label: platform_short_label(platform).to_string(),
                            active: quantum_blast() || active_platforms().contains(platform),
                        }
                    }
                }
            }
            header { class: "cq-topbar",
                div { class: "cq-topbar-inner",
                    div { class: "cq-drag-handle", onmousedown: drag_window }
                    div { class: "cq-topbar-main",
                        div { class: "cq-topbar-left",
                            div { class: "cq-brand",
                                div { class: "cq-kicker", "Quant OS / Frameless Cockpit" }
                                h1 { class: "cq-title", "ContextQuantum" }
                                input {
                                    class: "project-input-monospace",
                                    value: "{project_name()}",
                                    oninput: move |evt| project_name_input.set(evt.value())
                                }
                                p { class: "cq-subtitle", "A glass-morphic metadata forge that hydrates, inspects, and blasts drafts without leaving the rail." }
                            }
                            div { class: "cq-toolbar-block",
                                div { class: "cq-select-shell", "data-focus": if provider_missing { "true" } else { "false" },
                                    label { "Provider Valve" }
                                    select {
                                        class: "cq-select",
                                        value: "{selected_provider()}",
                                        onchange: move |evt| selected_provider_input.set(evt.value()),
                                        option { value: "", "Select provider" }
                                        for option in PROVIDER_OPTIONS {
                                            option { value: "{option}", "{option}" }
                                        }
                                    }
                                }
                                div { class: "cq-platform-matrix", "data-quantum": if quantum_blast() { "true" } else { "false" },
                                    div { class: "cq-panel-label", "Blast Radius" }
                                    div { class: "cq-platform-row", "data-quantum": if quantum_blast() { "true" } else { "false" },
                                        for platform in PLATFORM_OPTIONS {
                                            button {
                                                class: "cq-platform-toggle",
                                                "data-active": if active_platforms().contains(platform) { "true" } else { "false" },
                                                onclick: move |_| toggle_platform(platform.to_string()),
                                                "{platform}"
                                            }
                                        }
                                    }
                                }
                                button {
                                    class: "cq-quantum-switch",
                                    "data-active": if quantum_blast() { "true" } else { "false" },
                                    onclick: toggle_quantum_blast,
                                    "QUANTUM BLAST"
                                }
                                div { class: "cq-select-shell",
                                    label { "Shop" }
                                    select {
                                        class: "cq-select",
                                        value: "{shop_choice()}",
                                        onchange: move |evt| shop_choice_input.set(evt.value()),
                                        for option in SHOP_OPTIONS {
                                            option { value: "{option}", "{option}" }
                                        }
                                    }
                                }
                                div { class: "cq-segment",
                                    SegmentButton { label: "Create".to_string(), active: mode() == WorkspaceMode::Create, onclick: move |_| mode_create.set(WorkspaceMode::Create) }
                                    SegmentButton { label: "Edit".to_string(), active: mode() == WorkspaceMode::Edit, onclick: move |_| mode_edit.set(WorkspaceMode::Edit) }
                                }
                            }
                        }
                        div { class: "cq-topbar-right",
                            div { class: "cq-monitor-block",
                                MonitorTile { label: "Queued".to_string(), value: pipeline_status().queued_jobs.to_string() }
                                MonitorTile { label: "Complete".to_string(), value: pipeline_status().completed_jobs.to_string() }
                                MonitorTile { label: "Pending".to_string(), value: pending_imports().len().to_string() }
                            }
                            OrbAction { label: "Forge".to_string(), armed: blast_armed, quantum: quantum_blast(), pulse: orb_pulse, onclick: queue_publish }
                            if cfg!(all(feature = "desktop", not(target_arch = "wasm32"))) {
                                div { class: "cq-window-controls",
                                    WindowChromeButton { label: "_".to_string(), tone: "normal".to_string(), onclick: minimize_window }
                                    WindowChromeButton { label: "[]".to_string(), tone: "normal".to_string(), onclick: toggle_maximize }
                                    WindowChromeButton { label: "X".to_string(), tone: "close".to_string(), onclick: close_window }
                                }
                            }
                        }
                    }
                }
            }

            div { class: "cq-workbench", "data-inspector": if inspector_visible { "true" } else { "false" },
                div { class: "cq-banner", "{banner()}" }
                div { class: "log-terminal",
                    for log in forge_logs.iter() {
                        p { "{log}" }
                    }
                }
                section { class: "cq-stage-panel",
                    QuantumCarousel {
                        mode: mode(),
                        items,
                        center_index,
                        selected_ids,
                        master_template_id,
                        pending_imports,
                        pipeline: pipeline_status,
                        batch_draft,
                        on_set_center: focus_card,
                        on_toggle_select: toggle_select,
                        on_set_master: set_master,
                        on_import_master_template: import_master_template,
                        on_import_images: import_images,
                        on_update_batch_title: move |value| batch_title_draft.write().title_prefix = value,
                        on_update_batch_description: move |value| batch_description_draft.write().description_append = value,
                        on_update_batch_tags: move |value| batch_tags_draft.write().tags_csv = value,
                        on_apply_batch: apply_batch,
                    }
                }
                if let Some(item) = active_item.clone() {
                    aside { key: "{item.client_id}", class: "cq-inspector",
                        div { class: "cq-inspector-shell",
                            div { class: "cq-inspector-header",
                                div { class: "cq-panel-label", "Metadata Inspector" }
                                h2 { class: "cq-inspector-title", "Live Packet Editing" }
                                div { class: "cq-chip-row",
                                    span { class: "cq-chip cq-chip--purple", "{item.source_label}" }
                                    span { class: "cq-chip", "Provider: {selected_provider()}" }
                                    span { class: "cq-chip cq-chip--green", "Shop: {shop_choice()}" }
                                }
                                p { class: "cq-note", "Selected card metadata updates are applied directly onto the hydrated QuantumPacket draft." }
                            }
                            div { class: "cq-template-deck",
                                div { class: "cq-panel-label", "Template Relay" }
                                div { class: "cq-template-list",
                                    for template in persisted_templates.iter().cloned() {
                                        button {
                                            key: "{template.label}",
                                            class: "template-pill",
                                            onclick: move |_| {
                                                let Some(target_id) = active_card_id() else {
                                                    let mut banner_signal = banner;
                                                    banner_signal.set("Select an active asset before merging a metadata template.".to_string());
                                                    return;
                                                };

                                                let mut item_signal = items;
                                                let mut banner_signal = banner;
                                                let template = template.clone();
                                                let mut updated = false;
                                                if let Some(item) = item_signal.write().iter_mut().find(|item| item.client_id == target_id) {
                                                    let mut asset = asset_from_workbench_item(item);
                                                    merge_template_into_asset(&mut asset, &template);
                                                    apply_asset_to_workbench_item(item, &asset);
                                                    updated = true;
                                                }

                                                if updated {
                                                    banner_signal.set(format!("Template '{}' merged into the active asset.", template.label));
                                                }
                                            },
                                            "{template.label}"
                                        }
                                    }
                                }
                            }
                            if let Some(asset) = active_asset.clone() {
                                RefinementCockpit {
                                    asset,
                                    on_change: handle_refinement_change,
                                }
                            }
                            div { class: "cq-chip-row",
                                span { class: "cq-chip", "Client ID #{item.client_id}" }
                                if item.is_master_template { span { class: "cq-chip cq-chip--purple", "Master Template" } }
                                if item.dirty { span { class: "cq-chip cq-chip--green", "Unsaved Draft" } }
                            }
                            div { class: "cq-inspector-actions",
                                ControlButton { label: "Mark As Master".to_string(), tone: "secondary".to_string(), onclick: move |_| set_master_action(item.client_id) }
                                ControlButton { label: "Select For Batch".to_string(), tone: "success".to_string(), onclick: move |_| toggle_select_action(item.client_id) }
                            }
                        }
                    }
                }
            }
        }
    }
}

#[component]
pub fn RefinementCockpit(asset: crate::models::Asset, on_change: EventHandler<crate::models::Asset>) -> Element {
    let title_value = asset_metadata_value(&asset, "title");
    let description_value = asset_metadata_value(&asset, "description");
    let tags_value = asset_metadata_value(&asset, "tags");
    let title_asset = asset.clone();
    let description_asset = asset.clone();
    let tags_asset = asset.clone();
    let commit_asset = asset.clone();

    rsx! {
        div { class: "refinement-panel",
            h2 { class: "cyan-accent", "TARGET: {asset.filename}" }
            div { class: "cq-field-group",
                label { "Title" }
                input {
                    class: "cq-input",
                    value: "{title_value}",
                    oninput: move |e| {
                        let mut next_asset = title_asset.clone();
                        next_asset.metadata.insert("title".to_string(), e.value());
                        on_change.call(next_asset);
                    }
                }
            }
            div { class: "cq-field-group",
                label { "Description" }
                textarea {
                    class: "cq-textarea",
                    value: "{description_value}",
                    oninput: move |e| {
                        let mut next_asset = description_asset.clone();
                        next_asset.metadata.insert("description".to_string(), e.value());
                        on_change.call(next_asset);
                    }
                }
            }
            div { class: "cq-field-group",
                label { "Tags (Comma Separated)" }
                textarea {
                    class: "cq-textarea",
                    value: "{tags_value}",
                    oninput: move |e| {
                        let mut next_asset = tags_asset.clone();
                        next_asset.metadata.insert("tags".to_string(), e.value());
                        on_change.call(next_asset);
                    }
                }
            }
            button {
                class: "forge-ignite-button",
                onclick: move |_| {
                    let mut next_asset = commit_asset.clone();
                    next_asset.status = "Refined".to_string();
                    on_change.call(next_asset);
                },
                "COMMIT REFINEMENT"
            }
        }
    }
}

#[component]
fn OrbAction(label: String, armed: bool, quantum: bool, pulse: bool, onclick: EventHandler<MouseEvent>) -> Element {
    rsx! { button { class: "cq-orb-action", "data-armed": if armed { "true" } else { "false" }, "data-quantum": if quantum { "true" } else { "false" }, "data-pulse": if pulse { "true" } else { "false" }, onclick: move |evt| onclick.call(evt), "{label}" } }
}

#[component]
fn WindowChromeButton(label: String, tone: String, onclick: EventHandler<MouseEvent>) -> Element {
    rsx! { button { class: format!("cq-window-control cq-window-control--{}", tone), onclick: move |evt| onclick.call(evt), "{label}" } }
}

#[component]
fn ControlButton(label: String, tone: String, onclick: EventHandler<MouseEvent>) -> Element {
    rsx! { button { class: format!("cq-control cq-control--{}", tone), onclick: move |evt| onclick.call(evt), "{label}" } }
}

#[component]
fn SegmentButton(label: String, active: bool, onclick: EventHandler<MouseEvent>) -> Element {
    rsx! { button { class: "cq-segment-button", "data-active": if active { "true" } else { "false" }, onclick: move |evt| onclick.call(evt), "{label}" } }
}

#[component]
fn MonitorTile(label: String, value: String) -> Element {
    rsx! {
        div { class: "cq-monitor-tile",
            span { class: "cq-monitor-label", "{label}" }
            strong { class: "cq-monitor-value", "{value}" }
        }
    }
}


#[component]
fn StatusRailNode(label: String, active: bool) -> Element {
    rsx! {
        div { class: "cq-status-node", "data-active": if active { "true" } else { "false" },
            div { class: "cq-status-orb" }
            span { class: "cq-status-label", "{label}" }
        }
    }
}

fn platform_short_label(platform: &str) -> &'static str {
    match platform {
        "Amazon" => "AM",
        "Etsy" => "ET",
        "eBay" => "EB",
        "TikTok" => "TT",
        "Walmart" => "WM",
        "Meta" => "ME",
        _ => "??",
    }
}
fn persisted_connection_value(connections: &[String], prefix: &str) -> Option<String> {
    connections
        .iter()
        .find_map(|entry| entry.strip_prefix(prefix).map(ToOwned::to_owned))
}

fn persisted_workspace_mode(connections: &[String]) -> WorkspaceMode {
    match persisted_connection_value(connections, "mode:").as_deref() {
        Some("edit") => WorkspaceMode::Edit,
        _ => WorkspaceMode::Create,
    }
}

fn persisted_platform_set(connections: &[String]) -> BTreeSet<String> {
    connections
        .iter()
        .filter_map(|entry| entry.strip_prefix("platform:").map(ToOwned::to_owned))
        .collect()
}

fn default_metadata_template() -> MetadataTemplate {
    let mut provider_settings = std::collections::HashMap::new();
    provider_settings.insert("provider".to_string(), "Printful".to_string());
    provider_settings.insert("mode".to_string(), "create".to_string());

    MetadataTemplate {
        label: "Default Forge".to_string(),
        title_prefix: "ContextQuantum".to_string(),
        tags: vec!["contextquantum".to_string(), "forge".to_string()],
        provider_settings,
    }
}

fn build_quantum_connections(
    mode: WorkspaceMode,
    provider: &str,
    shop: &str,
    active_platforms: &BTreeSet<String>,
    quantum_blast: bool,
    active_card_id: Option<u64>,
    master_template_id: Option<u64>,
) -> Vec<String> {
    let mut connections = Vec::new();
    connections.push(format!(
        "mode:{}",
        match mode {
            WorkspaceMode::Create => "create",
            WorkspaceMode::Edit => "edit",
        }
    ));
    connections.push(format!("provider:{provider}"));
    connections.push(format!("shop:{shop}"));
    if quantum_blast {
        connections.push("quantum_blast:armed".to_string());
    }
    if let Some(id) = active_card_id {
        connections.push(format!("active_card:{id}"));
    }
    if let Some(id) = master_template_id {
        connections.push(format!("master_template:{id}"));
    }
    connections.extend(active_platforms.iter().map(|platform| format!("platform:{platform}")));
    connections
}

fn build_quantum_logs(
    banner: &str,
    pipeline_status: &PipelineStatus,
    item_count: usize,
    pending_imports: usize,
    selected_count: usize,
) -> Vec<String> {
    let mut logs = vec![banner.to_string()];
    logs.push(format!("phase:{}", pipeline_status.phase.label()));
    if !pipeline_status.note.trim().is_empty() {
        logs.push(pipeline_status.note.clone());
    }
    logs.push(format!("items:{item_count}"));
    logs.push(format!("pending_imports:{pending_imports}"));
    logs.push(format!("selected:{selected_count}"));
    logs
}

fn build_quantum_assets(items: &[WorkbenchItem]) -> Vec<crate::models::Asset> {
    items
        .iter()
        .map(|item| {
            let mut metadata = std::collections::HashMap::new();
            metadata.insert("title".to_string(), item.packet.forge.title.clone());
            metadata.insert("description".to_string(), item.packet.forge.description.clone());
            metadata.insert("tags".to_string(), item.packet.forge.tags.join(", "));
            metadata.insert("preview_url".to_string(), item.preview_url.clone().unwrap_or_default());
            metadata.insert("provider".to_string(), format!("{:?}", item.packet.provider));
            metadata.insert("store_id".to_string(), item.packet.store_id.clone());
            metadata.insert("source_label".to_string(), item.source_label.clone());
            metadata.insert("dirty".to_string(), item.dirty.to_string());
            metadata.insert("is_master_template".to_string(), item.is_master_template.to_string());
            metadata.insert("publish_ready".to_string(), item.packet.forge.publish_ready.to_string());
            metadata.insert("qc_approved".to_string(), item.packet.forge.qc_approved.to_string());

            crate::models::Asset {
                id: item.client_id.to_string(),
                filename: item.source_label.clone(),
                status: asset_status(item).to_string(),
                metadata,
            }
        })
        .collect()
}

fn asset_from_workbench_item(item: &WorkbenchItem) -> crate::models::Asset {
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("title".to_string(), item.packet.forge.title.clone());
    metadata.insert("description".to_string(), item.packet.forge.description.clone());
    metadata.insert("tags".to_string(), item.packet.forge.tags.join(", "));
    metadata.insert("preview_url".to_string(), item.preview_url.clone().unwrap_or_default());
    metadata.insert("provider".to_string(), format!("{:?}", item.packet.provider));
    metadata.insert("store_id".to_string(), item.packet.store_id.clone());
    metadata.insert("source_label".to_string(), item.source_label.clone());
    metadata.insert("dirty".to_string(), item.dirty.to_string());
    metadata.insert("is_master_template".to_string(), item.is_master_template.to_string());
    metadata.insert("publish_ready".to_string(), item.packet.forge.publish_ready.to_string());
    metadata.insert("qc_approved".to_string(), item.packet.forge.qc_approved.to_string());

    crate::models::Asset {
        id: item.client_id.to_string(),
        filename: item.source_label.clone(),
        status: asset_status(item).to_string(),
        metadata,
    }
}

fn asset_metadata_value(asset: &crate::models::Asset, key: &str) -> String {
    asset.metadata.get(key).cloned().unwrap_or_default()
}

fn apply_asset_to_workbench_item(item: &mut WorkbenchItem, asset: &crate::models::Asset) {
    item.packet.forge.title = asset_metadata_value(asset, "title");
    item.packet.forge.description = asset_metadata_value(asset, "description");
    item.packet.forge.tags = parse_tags_csv(&asset_metadata_value(asset, "tags"));
    item.source_label = asset.filename.clone();
    item.dirty = true;
    match asset.status.as_str() {
        "Forged" => {
            item.packet.forge.qc_approved = true;
            item.packet.forge.publish_ready = true;
        }
        "Refined" => {
            item.packet.forge.qc_approved = true;
            item.packet.forge.publish_ready = false;
        }
        _ => {
            item.packet.forge.qc_approved = false;
            item.packet.forge.publish_ready = false;
        }
    }
}

fn asset_status(item: &WorkbenchItem) -> &'static str {
    if item.packet.forge.publish_ready {
        "Forged"
    } else if item.packet.forge.qc_approved
        || !item.packet.forge.title.trim().is_empty()
        || !item.packet.forge.description.trim().is_empty()
        || !item.packet.forge.tags.is_empty()
    {
        "Refined"
    } else {
        "Raw"
    }
}

#[cfg(target_arch = "wasm32")]
fn seed_workspace_items() -> Vec<WorkbenchItem> {
    let master = seed_master_template_item();
    let master_packet = master.packet.clone();
    let demo_payload = wasm_demo_payload();
    let mut items = vec![master];
    let mut hydrated = hydrate_imported_items(&demo_payload, Some(&master_packet), 2);
    for item in hydrated.iter_mut() {
        item.packet.forge.publish_ready = true;
        item.packet.forge.qc_approved = true;
        item.dirty = false;
    }
    items.extend(hydrated);
    items
}

#[cfg(not(target_arch = "wasm32"))]
fn seed_workspace_items() -> Vec<WorkbenchItem> {
    vec![seed_master_template_item()]
}

#[cfg(target_arch = "wasm32")]
fn seed_pending_imports() -> Vec<ImportedImageStub> {
    wasm_demo_payload()
}

#[cfg(not(target_arch = "wasm32"))]
fn seed_pending_imports() -> Vec<ImportedImageStub> {
    Vec::new()
}

#[cfg(target_arch = "wasm32")]
fn wasm_demo_payload() -> Vec<ImportedImageStub> {
    vec![
        ImportedImageStub {
            file_name: "demo_signal_01.png".to_string(),
            preview_url: Some("https://placehold.co/960x1280/0b0f19/8b5cf6?text=Signal+01".to_string()),
            mime_hint: Some("image/png".to_string()),
        },
        ImportedImageStub {
            file_name: "demo_signal_02.jpg".to_string(),
            preview_url: Some("https://placehold.co/960x1280/111827/f3f4f6?text=Signal+02".to_string()),
            mime_hint: Some("image/jpeg".to_string()),
        },
        ImportedImageStub {
            file_name: "demo_signal_03.png".to_string(),
            preview_url: Some("https://placehold.co/960x1280/111827/10b981?text=Signal+03".to_string()),
            mime_hint: Some("image/png".to_string()),
        },
    ]
}

fn seed_master_template_item() -> WorkbenchItem {
    WorkbenchItem {
        client_id: 1,
        packet: base_packet("Master Template", "master_template.png", "memory://master-template"),
        preview_url: Some("memory://master-template".to_string()),
        source_label: "master_template.png".to_string(),
        dirty: false,
        is_master_template: true,
    }
}

fn resolve_master_packet(items: &[WorkbenchItem], master_template_id: Option<u64>) -> Option<QuantumPacket> {
    master_template_id
        .and_then(|target_id| items.iter().find(|item| item.client_id == target_id).map(|item| item.packet.clone()))
        .or_else(|| items.iter().find(|item| item.is_master_template).map(|item| item.packet.clone()))
}

fn hydrate_imported_items(imports: &[ImportedImageStub], master_packet: Option<&QuantumPacket>, starting_client_id: u64) -> Vec<WorkbenchItem> {
    imports
        .iter()
        .enumerate()
        .map(|(offset, import)| {
            let client_id = starting_client_id + offset as u64;
            let preview_url = import.preview_url.clone().unwrap_or_else(|| fallback_preview_url(&import.file_name));
            let mut packet = master_packet.cloned().unwrap_or_else(|| base_packet(&humanize_file_name(&import.file_name), &import.file_name, &preview_url));
            packet.artwork.file_name = import.file_name.clone();
            packet.artwork.image_data_url = preview_url.clone();
            packet.platform.mockup_urls = vec![preview_url.clone()];
            packet.forge.qc_approved = false;
            packet.forge.publish_ready = false;
            if packet.forge.title.trim().is_empty() { packet.forge.title = humanize_file_name(&import.file_name); }
            WorkbenchItem { client_id, packet, preview_url: Some(preview_url), source_label: import.file_name.clone(), dirty: true, is_master_template: false }
        })
        .collect()
}

#[derive(Clone, Debug, Serialize)]
struct OmniBlastMetadata {
    client_id: u64,
    title: String,
    description: String,
    tags: Vec<String>,
    source_label: String,
    preview_url: Option<String>,
    provider: String,
}

fn build_omni_payload(
    platforms: &[String],
    provider: &str,
    items: &[WorkbenchItem],
) -> BTreeMap<String, Vec<OmniBlastMetadata>> {
    let ready_metadata = items
        .iter()
        .filter(|item| item.packet.forge.publish_ready)
        .map(|item| OmniBlastMetadata {
            client_id: item.client_id,
            title: item.packet.forge.title.clone(),
            description: item.packet.forge.description.clone(),
            tags: item.packet.forge.tags.clone(),
            source_label: item.source_label.clone(),
            preview_url: item.preview_url.clone(),
            provider: provider.to_string(),
        })
        .collect::<Vec<_>>();

    platforms
        .iter()
        .map(|platform| (platform.clone(), ready_metadata.clone()))
        .collect()
}

fn mutate_active_item(mut items: Signal<Vec<WorkbenchItem>>, active_card_id: Option<u64>, mut mutate: impl FnMut(&mut WorkbenchItem)) {
    let Some(target_id) = active_card_id else { return; };
    if let Some(item) = items.write().iter_mut().find(|item| item.client_id == target_id) {
        mutate(item);
    }
}

fn base_packet(title: &str, file_name: &str, image_data_url: &str) -> QuantumPacket {
    QuantumPacket {
        provider: FulfillmentProvider::Printful,
        store_id: "context-quantum-drafts".to_string(),
        forge: ForgeOutput {
            title: title.to_string(),
            description: format!("{title} is staged inside ContextQuantum and ready for metadata refinement."),
            tags: vec!["contextquantum".to_string(), "draft".to_string()],
            qc_approved: false,
            publish_ready: false,
        },
        artwork: ArtworkPayload { file_name: file_name.to_string(), image_data_url: image_data_url.to_string(), artwork_bounds: None },
        template: ProviderTemplateContext::Printful(PrintfulTemplateContext {
            thumbnail_url: None,
            placement_guide: PlacementGuide {
                position: PlacementPosition::Front,
                width: 14.0,
                height: 16.0,
                source: PlacementGuideSource::Fallback,
                decoration_method: Some("dtg".to_string()),
            },
            variants: vec![PrintfulSyncVariantContext {
                variant_id: 1001,
                retail_price: Some("29.00".to_string()),
                options: vec![
                    PrintfulVariantOptionContext { id: Some("size".to_string()), value: Some("L".to_string()) },
                    PrintfulVariantOptionContext { id: Some("color".to_string()), value: Some("Black".to_string()) },
                ],
            }],
        }),
        platform: PlatformPacketContext { sku: None, quantity: 1, price_major: 29.0, mockup_urls: vec![image_data_url.to_string()], etsy: None },
    }
}

fn humanize_file_name(file_name: &str) -> String {
    file_name
        .rsplit_once('.')
        .map(|(stem, _)| stem)
        .unwrap_or(file_name)
        .replace(['_', '-', '.'], " ")
        .split_whitespace()
        .map(capitalize_word)
        .collect::<Vec<_>>()
        .join(" ")
}

fn capitalize_word(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), chars.as_str().to_ascii_lowercase()),
        None => String::new(),
    }
}

fn merge_template_into_asset(asset: &mut crate::models::Asset, template: &MetadataTemplate) {
    crate::models::merge_template_metadata(asset, template);
}

fn parse_tags_csv(raw: &str) -> Vec<String> {
    raw.split(',').map(|tag| tag.trim().to_string()).filter(|tag| !tag.is_empty()).collect()
}

fn merge_tags(existing: &[String], incoming: &[String]) -> Vec<String> {
    let mut merged = existing.to_vec();
    for tag in incoming {
        if !merged.iter().any(|current| current.eq_ignore_ascii_case(tag)) {
            merged.push(tag.clone());
        }
    }
    merged
}

fn fallback_preview_url(file_name: &str) -> String {
    format!("blob:contextquantum/{}", sanitize_token(file_name))
}

fn sanitize_token(name: &str) -> String {
    name.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' }).collect()
}
