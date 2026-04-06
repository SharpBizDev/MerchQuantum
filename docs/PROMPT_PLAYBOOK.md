# MerchQuantum Prompt Playbook

Use this playbook to keep Codex work narrow, coherent, and easy to publish safely.

## Core prompting rules
- Ask for one coherent task at a time.
- Name the exact files or section in scope.
- Say what must not be touched.
- State whether the pass is:
  - UI-only
  - provider-safe
  - AI-only
  - diagnostics-only
  - publication-safe
- Require validation that matches the scope.
- Use approval gates before commit/push when the pass is exploratory or review-oriented.

## Repo-safe framing
Good framing:
- “Patch only `app/components/MerchQuantumApp.tsx`.”
- “Do not touch provider files.”
- “Do not redesign the UI.”
- “Minimal diff only.”

Avoid:
- “Clean up whatever looks wrong.”
- “Refactor the whole flow while you are there.”
- “Fix AI, provider, and UI together unless needed.”

## Example prompt patterns

### Narrow UI pass
Use when you want a visible workflow tweak with no backend drift.

Example:
> Read `AGENTS.md` and `docs/MERCHQUANTUM_RECOVERY.md` first.  
> Task: simplify the Batch Setup product selection copy in `app/components/MerchQuantumApp.tsx` only.  
> Do not touch providers, AI, or deployment files.  
> Minimal diff only.  
> Validate with `npx tsc --noEmit` and `npm run build`.  
> Do not commit. Do not push.

### Provider-safe pass
Use when the backend provider layer should change while the UI stays frozen.

Example:
> Read `AGENTS.md` and `docs/MERCHQUANTUM_RECOVERY.md` first.  
> Task: update the Printful adapter only.  
> Scope: `lib/providers/printful/adapter.ts`, related provider route if strictly required, and `tests/providers/provider-core.test.ts`.  
> Do not touch UI or AI files.  
> Run provider-focused validation and stop before commit.

### AI-only pass
Use when tuning the listing engine without UI/provider drift.

Example:
> Read `AGENTS.md` and `docs/MERCHQUANTUM_RECOVERY.md` first.  
> Task: tune reason-flag deduplication only.  
> Scope: `lib/ai/listing-engine.ts` and `tests/ai/listing-engine.test.ts`.  
> Preserve the current UI contract.  
> No provider work. No UI redesign.  
> Run AI-focused validation and return a report only.

### Diagnostics-only pass
Use when you want truth first and no speculative edits.

Example:
> Read `AGENTS.md` and `docs/MERCHQUANTUM_RECOVERY.md` first.  
> Task: verify live `/api/ai/listing` behavior on production.  
> Diagnostics only.  
> Do not change code unless an absolutely tiny fix is required after evidence is gathered.  
> Return findings, root cause, and exact next step.

### Publication-safe pass
Use when local Git is unreliable or the publication unit must stay tight.

Example:
> Read `AGENTS.md` and `docs/MERCHQUANTUM_RECOVERY.md` first.  
> Treat GitHub remote `main` as source of truth.  
> Publish only:
> - `lib/ai/listing-engine.ts`
> - `tests/ai/listing-engine.test.ts`
> Do not publish docs, fixtures, package files, providers, or UI files.  
> Validate scope and stop after publish.

## Approval-gate guidance
Use an approval gate when:
- the change is exploratory
- live/runtime truth is uncertain
- publication scope could be confused
- there is a risk of stacking multiple fixes without a clean before/after

Typical gate:
- “Do not commit.”
- “Do not push.”
- “Return the report only.”

## Publication-unit guidance
- Keep one coherent unit per publish.
- Publish runtime fixes before stacking follow-on tuning.
- Do not mix docs with AI or deployment changes unless that mixed package is explicitly approved.
- If transport/publication is blocked, export an exact packet instead of guessing.

## Durable repo supervision guidance
- Prefer durable docs and workflows over relying on chat memory.
- Prefer honest workflow scaffolds over fake coverage claims.
- Prefer preserving the existing golden corpus over replacing it casually.
- When future deployment planning is the task, point the work at `docs/HOSTINGER_CLOUD_STARTUP.md` and keep Vercel-vs-Hostinger planning separate from current app behavior changes.
