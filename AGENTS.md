# MerchQuantum Codex Operating Rules

MerchQuantum is a Printify-first, draft-first Next.js / React / TypeScript application.

## Canonical project references
- Repo: https://github.com/SharpBizDev/MerchQuantum
- Live app: https://merch-quantum.vercel.app/
- Primary UI file: `app/components/MerchQuantumApp.tsx`
- Primary backend routes: `app/api/printify/*` and `app/api/ai/listing/route.ts`

## Core rule
Treat the current repository state as the primary code baseline.
Use the live app only as a comparison point.
Do not make broad cleanup passes.
Do not silently refactor untargeted sections.

## Required workflow
1. Read this file first.
2. Read `docs/MERCHQUANTUM_RECOVERY.md` before editing.
3. Inspect the relevant files before changing anything.
4. State the exact file or files to be changed.
5. Patch only the named section requested.
6. Treat all untouched sections as read-only.
7. Run install, typecheck, and production build before handoff.
8. Return only the changed file or files plus a concise summary.

## No-regression rules
- No broad cleanup passes.
- No style unification passes unless explicitly requested.
- No silent reversions of accepted behavior.
- No changing unrelated sections while fixing one section.
- Preserve draft-first upload behavior unless explicitly told otherwise.
- If repo state, live app state, and target request conflict, report the differences clearly before patching.

## Section lock map
- Quantum Connection: provider selection, token input, connect / connected / disconnect behavior, one green, one purple, one white, no unexpected container expansion.
- Batch Setup: no duplicated top labels when that rule is active, field meaning should live in the control itself, auto-load preferred over unnecessary execution buttons.
- Batch Preview: compact thumbnail review grid, hover enlarge, click populates Listing Detail, no title / description clutter in preview cards.
- Listing Detail: detailed editing area for selected artwork, final title, final description, and all 13 tags.
- Upload Draft Products: preserve draft-first behavior unless explicitly requested.

## Validation required before handoff
- install dependencies
- run typecheck
- run production build
- confirm the named section changed as requested
- confirm untargeted sections did not drift

## Default primary target file
`app/components/MerchQuantumApp.tsx`

## Additional guidance
If a more detailed recovery note exists in `docs/MERCHQUANTUM_RECOVERY.md`, treat it as the fuller control document for this repository.
