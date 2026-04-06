# START HERE

MerchQuantum reusable baseline repo.

## Valid working repo path
- `C:\Users\prog\OneDrive\Documents\New Project`

## Read these files first
1. `AGENTS.md`
2. `docs/MERCHQUANTUM_RECOVERY.md`
3. `docs/CONTROL_LAYER_MAP.md`
4. `docs/ARCHITECTURE.md`
5. `docs/PROVIDER_RULES.md`
6. `docs/PROMPT_PLAYBOOK.md`
7. `docs/HOSTINGER_CLOUD_STARTUP.md` for future deployment direction

## Source of truth
- GitHub `main` is the source of truth.
- Treat the current repository state as the baseline.
- Use the live app only as a comparison point.

## Current hosting model
- Vercel is temporary testing/live only.
- Hostinger Cloud Startup is the likely future managed production target.
- Hostinger migration is later work, not current work.

## Hard repo rules
- Do not create `.codex-*` folders inside the repo root.
- Do not create nested repo copies or worktrees inside this repo.
- Do not use `git add -A`.
- Stage explicit files only.

## Control-document authority chain
- `AGENTS.md` sets operating rules and validation discipline.
- `docs/MERCHQUANTUM_RECOVERY.md` is the strongest restart/control document.
- `docs/CONTROL_LAYER_MAP.md` is the canonical map of the control layer and reading order.
- `docs/ARCHITECTURE.md` explains the current app structure.
- `docs/PROVIDER_RULES.md` defines provider philosophy and no-drift rules.
- `docs/PROMPT_PLAYBOOK.md` defines safe prompt patterns for future work.

## Practical baseline
- This repo is the reusable baseline/framework for MerchQuantum and closely related future apps.
