# MerchQuantum Codex Operating Rules

MerchQuantum is a draft-first Next.js / React / TypeScript application with a locked frontend baseline, a provider-core backend, and an AI listing engine that now has image-backed regression coverage.

## Canonical project references
- Repo: https://github.com/SharpBizDev/MerchQuantum
- Live app: https://merch-quantum.vercel.app/
- Primary UI file: `app/components/MerchQuantumApp.tsx`
- Primary AI route: `app/api/ai/listing/route.ts`
- Provider-core routes: `app/api/providers/*`
- Legacy Printify routes kept for compatibility: `app/api/printify/*`

## Path discipline
- Work only in the active repo path explicitly named by the user.
- Do not jump back to older repo paths once a new working path has been declared.
- Do not create `.codex-*` folders inside the repo root.
- Do not create nested worktrees or nested repo copies inside this repo.
- Treat temporary validation/output paths outside the repo as preferable to repo-root clutter when extra files are unavoidable.

## Core rule
Treat the current repository state as the primary code baseline.
Use the live app only as a comparison point.
Do not make broad cleanup passes.
Do not silently refactor untargeted sections.

## Required workflow
1. Read this file first.
2. Read `docs/MERCHQUANTUM_RECOVERY.md` before editing.
3. Use `START_HERE.md` as the quick repo entrypoint when present, but treat this file and `docs/MERCHQUANTUM_RECOVERY.md` as the higher-authority control layer.
4. Inspect the relevant files before changing anything.
5. State the exact file or files to be changed.
6. Patch only the named section requested.
7. Treat all untouched sections as read-only.
8. Run install, typecheck, and production build before handoff.
9. Return only the changed file or files plus a concise summary unless the user asks for a different report format.

## No-regression rules
- No broad cleanup passes.
- No style unification passes unless explicitly requested.
- No silent reversions of accepted behavior.
- No changing unrelated sections while fixing one section.
- Preserve draft-first upload behavior unless explicitly told otherwise.
- Preserve the current UI route contract unless explicitly asked to change it.
- If repo state, live app state, and target request conflict, report the differences clearly before patching.

## Git and publication hygiene
- Never use `git add -A`.
- Stage only explicit files.
- Keep one coherent publication unit per commit whenever possible.
- Do not mix UI, provider, AI, deployment, and docs changes unless the user explicitly approves a combined unit.
- Prefer branch + PR hygiene for non-emergency work.
- Treat GitHub `main` as source of truth when the user says local Git state is unreliable.
- If local Git staging or pushing is broken, stop retrying the same broken loop and switch to the next safest publication method.

## Validation expectations before publish
- Install dependencies: `npm install`
- Typecheck: `npx tsc --noEmit`
- Production build: `npm run build`
- Focused AI regression when AI files change: `npx --yes tsx tests/ai/listing-engine.test.ts`
- Focused provider regression when provider files change: `npx --yes tsx tests/providers/provider-core.test.ts`
- Confirm the named section changed as requested.
- Confirm untargeted sections did not drift.

## Branch and PR hygiene
- Use narrow, task-specific branches for normal delivery unless the user explicitly requests direct publication.
- Open PRs with one coherent change set and a clear validation summary.
- Treat protected-branch gates as part of the repo contract, not optional cleanup.
- Do not force-push or rewrite history unless explicitly requested.

## Section lock map
- Quantum Connection: provider selection, token input, connect / connected / disconnect behavior, one green, one purple, one white, no unexpected container expansion.
- Batch Setup: no duplicated top labels when that rule is active, field meaning should live in the control itself, auto-load preferred over unnecessary execution buttons.
- Batch Preview: compact thumbnail review grid, hover enlarge, click populates Listing Detail, no title / description clutter in preview cards.
- Listing Detail: detailed editing area for selected artwork, final title, final description, and all 13 tags.
- Upload Draft Products: preserve draft-first behavior unless explicitly requested.

## Default primary target file
`app/components/MerchQuantumApp.tsx`

## Additional guidance
- If a more detailed recovery note exists in `docs/MERCHQUANTUM_RECOVERY.md`, treat it as the fuller control document for this repository.
- `START_HERE.md` should remain a short entrypoint, not the place for deep repo detail.
- For durable repo guidance beyond this file, keep `docs/ARCHITECTURE.md`, `docs/PROVIDER_RULES.md`, and `docs/PROMPT_PLAYBOOK.md` current as the repo truth evolves.
