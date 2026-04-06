# MerchQuantum Control Layer Map

This file is the canonical index for the repo-native control layer.

Use it to answer four questions quickly:
- what to read first
- which files are authoritative
- where operational files live
- what to do after drift, hallucination, or a lost chat

## Canonical structure

### Repo root
- `START_HERE.md`
- `AGENTS.md`

### Docs
- `docs/MERCHQUANTUM_RECOVERY.md`
- `docs/ARCHITECTURE.md`
- `docs/PROVIDER_RULES.md`
- `docs/PROMPT_PLAYBOOK.md`
- `docs/HOSTINGER_CLOUD_STARTUP.md`
- `docs/CONTROL_LAYER_MAP.md`
- future retired control docs should move to `docs/legacy/`

### Workflow and automation files
- `.github/workflows/merchquantum-smoke.yml`
- `scripts/generate-smoke-report.mjs`

## Authority chain
1. `AGENTS.md`
2. `docs/MERCHQUANTUM_RECOVERY.md`
3. `docs/CONTROL_LAYER_MAP.md`
4. `START_HERE.md`
5. `docs/ARCHITECTURE.md`
6. `docs/PROVIDER_RULES.md`
7. `docs/PROMPT_PLAYBOOK.md`
8. `docs/HOSTINGER_CLOUD_STARTUP.md`

## Reading order for a fresh session
1. Read `AGENTS.md`.
2. Read `docs/MERCHQUANTUM_RECOVERY.md`.
3. Read `docs/CONTROL_LAYER_MAP.md`.
4. Use `START_HERE.md` as the short entrypoint and orientation check.
5. Read the specialized docs that match the task:
   - `docs/ARCHITECTURE.md`
   - `docs/PROVIDER_RULES.md`
   - `docs/PROMPT_PLAYBOOK.md`
   - `docs/HOSTINGER_CLOUD_STARTUP.md` when future deployment planning is relevant

## What each file is for

### Operational control
- `AGENTS.md`
  - operating rules
  - path discipline
  - validation rules
  - staging and publication hygiene

### Recovery and restart
- `docs/MERCHQUANTUM_RECOVERY.md`
  - strongest restart/control document
  - current repo truth
  - current operating model
  - restart sequence after drift or chat loss

### Quick entrypoint
- `START_HERE.md`
  - short orientation file
  - valid repo path
  - short reading order
  - hard repo rules at a glance

### Structure and boundaries
- `docs/ARCHITECTURE.md`
  - current app layers
  - where to work for UI, provider, AI, and workflow changes

- `docs/PROVIDER_RULES.md`
  - provider philosophy
  - active/supported provider truth
  - no-drift rules for provider work

- `docs/PROMPT_PLAYBOOK.md`
  - safe task framing
  - approval-gate patterns
  - publication-safe prompting

### Future deployment planning
- `docs/HOSTINGER_CLOUD_STARTUP.md`
  - future managed production target notes
  - migration-time validation checklist
  - Hostinger Cloud Startup as the primary planned future path

### Workflow and automation layer
- `.github/workflows/merchquantum-smoke.yml`
  - scheduled and manual smoke workflow

- `scripts/generate-smoke-report.mjs`
  - structured current-run smoke artifact generator

## Operational vs planning vs recovery
- Operational:
  - `AGENTS.md`
  - `START_HERE.md`
  - `.github/workflows/merchquantum-smoke.yml`
  - `scripts/generate-smoke-report.mjs`
- Recovery:
  - `docs/MERCHQUANTUM_RECOVERY.md`
  - `docs/CONTROL_LAYER_MAP.md`
- Planning:
  - `docs/ARCHITECTURE.md`
  - `docs/PROVIDER_RULES.md`
  - `docs/PROMPT_PLAYBOOK.md`
  - `docs/HOSTINGER_CLOUD_STARTUP.md`

## Fixed repo-truth rules this layer must agree on
- Valid working repo path:
  - `C:\Users\prog\OneDrive\Documents\New Project`
- Do not use the older polluted folder:
  - `C:\Users\prog\OneDrive\Documents\New project`
- GitHub `main` is the source of truth.
- Vercel is temporary test/live only.
- Hostinger Cloud Startup is the likely future managed production target.
- Do not create `.codex-*` folders in the repo root.
- Do not use `git add -A`.
- Stage explicit files only.

## Lost-chat or drift recovery
If a session becomes confused, contradictory, or loses context:
1. Stop relying on chat memory.
2. Re-read `AGENTS.md`.
3. Re-read `docs/MERCHQUANTUM_RECOVERY.md`.
4. Re-read this file.
5. Trust GitHub `main` over stale local branch assumptions.
6. Re-scope the task into one coherent unit before changing anything.

## Update rules
Update this control layer after meaningful changes to:
- repo workflow or publication rules
- restart or recovery process
- architecture boundaries
- provider activation/support truth
- deployment strategy direction
- smoke workflow/reporting structure

## Legacy handling
A control file becomes legacy when it is:
- superseded by a clearer canonical file
- materially misleading relative to current repo truth
- retained only for historical reference

When that happens:
- move it to `docs/legacy/`
- leave a clear pointer in the active control docs if the history still matters
- do not leave superseded control docs in active locations with ambiguous status
