# MerchQuantum Recovery and No-Regression Control File

This file converts the MerchQuantum recovery PDF into a repo-native text format for Codex and any future development session.

## Purpose
Use this file to rebuild working rules, app map, no-regression protocol, and restart process without relying on fragile chat memory.

## Canonical recovery bundle
- Public GitHub repo: https://github.com/SharpBizDev/MerchQuantum
- Live app: https://merch-quantum.vercel.app/
- Latest ZIP exported from the GitHub repo
- This text recovery file

## Application identity
- Name: MerchQuantum
- Tagline: Bulk product creation, simplified.
- Purpose: Bulk print-on-demand product creation with a Printify-first backend, roadmap UI for additional providers, AI-assisted listing generation, image upload, batch preview, and draft-first product creation.

## Current stack
- Next.js app router
- React
- TypeScript
- Tailwind / PostCSS
- Primary UI file: `app/components/MerchQuantumApp.tsx`
- Primary backend routes under `app/api`

## Current operating model
- GitHub `main` is the source of truth for the current accepted repo state.
- The clean working repo path for active local work is:
  - `C:\Users\prog\OneDrive\Documents\New Project`
- Do not use the older polluted local repo folder after this point:
  - `C:\Users\prog\OneDrive\Documents\New project`
- Vercel is the temporary live/test deployment layer for now.
- Hostinger Cloud Startup is the likely future managed production target, but migration is intentionally deferred.
- Hostinger / VPS migration work is not part of the current baseline.

## Mission-critical operating rule
Future sessions must treat GitHub `main` as the source of truth, use the live app as a comparison point rather than the primary baseline, inspect the latest repo state first, patch only the section explicitly requested, test locally before delivery, and avoid broad cleanup passes that reintroduce regressions.

## Repo control and memory files now present on repo truth
- `START_HERE.md` — short repo entrypoint for future sessions and handoffs
- `AGENTS.md` — repo operating rules, path discipline, explicit staging rules, validation rules, and publication hygiene
- `docs/MERCHQUANTUM_RECOVERY.md` — this recovery/control file
- `docs/CONTROL_LAYER_MAP.md` — canonical map of the control layer, reading order, and legacy-handling rules
- `docs/ARCHITECTURE.md` — practical repo architecture and layer map
- `docs/PROVIDER_RULES.md` — provider philosophy and no-drift rules
- `docs/PROMPT_PLAYBOOK.md` — prompt patterns for narrow, provider-safe, AI-only, diagnostics-only, and publication-safe work
- `docs/HOSTINGER_CLOUD_STARTUP.md` — future managed deployment planning notes for Hostinger Cloud Startup / Web Apps Hosting

## Control-layer authority chain
1. `AGENTS.md` — operating rules and validation discipline
2. `docs/MERCHQUANTUM_RECOVERY.md` — strongest restart/control document
3. `docs/CONTROL_LAYER_MAP.md` — canonical control index, reading order, and legacy/archive guidance
4. `START_HERE.md` — short entrypoint that points future sessions into the higher-authority docs
5. `docs/ARCHITECTURE.md` — current app structure
6. `docs/PROVIDER_RULES.md` — provider guardrails
7. `docs/PROMPT_PLAYBOOK.md` — safe prompting patterns
8. `docs/HOSTINGER_CLOUD_STARTUP.md` — future managed deployment planning only

## Current restart priority order
1. Read `AGENTS.md`.
2. Read `docs/MERCHQUANTUM_RECOVERY.md`.
3. Read `docs/CONTROL_LAYER_MAP.md`.
4. Trust GitHub `main` as the primary repo truth.
5. Use only the clean working repo path:
   - `C:\Users\prog\OneDrive\Documents\New Project`
6. Do not use the polluted old local folder:
   - `C:\Users\prog\OneDrive\Documents\New project`
7. Do not create `.codex-*` folders in the repo root.
8. Stage explicit files only. Never use `git add -A`.
9. Read `docs/HOSTINGER_CLOUD_STARTUP.md` only when future deployment planning is relevant.

## Core file map
- `app/components/MerchQuantumApp.tsx` — main client UI and workflow logic
- `app/api/printify/connect/route.ts` — validate Printify token and populate shops
- `app/api/printify/disconnect/route.ts` — clear stored Printify token cookie
- `app/api/printify/products/route.ts` — list shop products
- `app/api/printify/product/route.ts` — load one product and derive placement guidance
- `app/api/printify/batch-create/route.ts` — upload artwork, apply placement, create drafts
- `app/api/providers/*` — generic provider-core routes for connect, disconnect, product loading, and batch draft creation
- `app/api/ai/listing/route.ts` — AI rewrite endpoint with Gemini / fallback behavior

## Printify integration truths
- The live backend is Printify-first.
- Provider execution now routes through the generic provider-core backend under `app/api/providers/*`, but the locked frontend should only expose providers that are truly supported in the current workflow.
- Authentication model in the app is Personal Access Token, not multi-merchant OAuth.
- Shop discovery uses `GET /v1/shops.json`.
- Product listing uses `GET /v1/shops/{shop_id}/products.json`.
- Product detail uses `GET /v1/shops/{shop_id}/products/{product_id}.json`.
- Image upload uses `POST /v1/uploads/images.json`.
- Draft creation uses `POST /v1/shops/{shop_id}/products.json`.
- Draft-first flow is preferred. Do not reintroduce auto-publish unless explicitly requested.

## Important implementation truths
- The client hard-caps a batch at 50 files.
- The UI and listing logic are concentrated heavily in one file: `MerchQuantumApp.tsx`.
- Artwork placement logic matters because transparent canvas space can distort apparent top alignment if handled poorly.
- The AI route is not the whole app. It is one part of the flow and must not be allowed to break unrelated sections.
- The project has a history of regression loops where fixing one area accidentally reverts another.

## Three-section reality check
Always separate these three realities before editing:
1. Current deployed state — what the live app shows right now.
2. Current repo state — what GitHub main and current working files contain right now.
3. Approved target state — what Corey most recently approved in the active working conversation.

## Non-negotiable no-regression rules
- Change only the named section.
- State the exact file or files to be touched before patching.
- All untargeted sections are read-only.
- No broad cleanup passes.
- No style unification passes unless explicitly requested.
- No silent reversions of accepted UI behavior.
- Return only the changed file or files.
- Test before handoff.

## Validation gate before any handoff
- Install dependencies against the current repo baseline.
- Run typecheck.
- Run production build.
- Confirm the named section changed as requested.
- Confirm untargeted sections did not drift.

## Local workspace hygiene rules now in force
- Work only in the currently declared clean repo path.
- Do not create `.codex-*` folders inside the repo root.
- Do not create nested repo copies or nested worktrees inside this repo.
- Stage only explicit files.
- If local Git staging or push is unreliable, stop looping on broken publication methods and switch to the next safest publication path.

## Section lock map
- Quantum Connection: provider selection, token input, connect / connected / disconnect behavior, one green, one purple, one white, no unexpected container expansion.
- Batch Setup: no duplicated top labels when that rule is active, field meaning should live in the control itself, auto-load preferred over unnecessary execution buttons.
- Batch Preview: compact thumbnail review grid, hover enlarge, click populates Listing Detail, no title / description clutter in preview cards.
- Listing Detail: detailed editing area for selected artwork, final title, final description, and all 13 tags.
- Upload Draft Products: preserve draft-first behavior unless explicitly requested.

## Accepted UI baseline from April 2, 2026
- App work patched only: `app/components/MerchQuantumApp.tsx`
- The current MerchQuantum UI is now frozen as the working frontend baseline.
- Quantum Connection remains a separate branded top section.
- The workflow below it is image-first and unified: drag/import, thumbnail review, template/shop controls, then Listing Detail.
- Listing Detail is now a read-only review surface with Uploaded Artwork, Upload Draft Products, Final Title, Final Description, and Tags.
- Upload Draft Products remains the primary draft-first action.

## Locked behavior from the accepted baseline
- Batch Setup no longer uses redundant top labels above controls that already explain themselves.
- Template Source options and order are locked to: `Template Source`, `Choose From My Products`, `Paste Product Reference`.
- Product mode control order is locked to `Choose Product` then `Search My Products`.
- Manual/reference mode control order is locked to `Product Reference` then `Template Nickname`.
- Refresh and Load Template Description buttons are removed from Batch Setup.
- Template loading is automatic from product selection or valid product reference entry.
- The drag-and-drop image area now lives inside Batch Setup and should stay there unless explicitly requested otherwise.
- Batch Preview is now a dense thumbnail review grid with a fixed legend/header outside the scroll area.
- Per-thumbnail text clutter is removed from Batch Preview.
- Per-thumbnail status is represented by compact light indicators plus remove control.
- Listing Detail is review-only. Final Title, Final Description, and Tags are not manually editable in the app.
- Upload Draft Products is no longer a separate section and is merged into Listing Detail.
- Compact spacing and polish across Batch Setup, Batch Preview, and Listing Detail is part of the accepted UI baseline.

## Read-only unless explicitly requested
- Quantum Connection remains read-only unless directly requested.
- Batch Setup should not be re-expanded with old labels, Refresh, or Load Template Description controls.
- Batch Preview should not regain per-item title / description clutter or the moved drag-and-drop controls.
- Listing Detail should remain a read-only review area with the merged upload action unless explicitly changed.
- Upload Draft Products should remain draft-first and merged into Listing Detail unless explicitly changed.
- Backend routes and untargeted sections should remain untouched unless the next request clearly names them.

## Provider architecture Phase 0
- Phase 0 begins behind the frozen UI baseline.
- Goal: preserve the current frontend promise while normalizing provider behavior behind an adapter layer.
- Phase 0 scope is contract/core only:
  - normalized provider types
  - provider capabilities
  - provider error normalization
  - provider session helpers
  - provider registry
  - Printify as the first implemented reference adapter path
- Do not redesign the UI as part of provider-core work.
- Do not implement additional providers in Phase 0.
- Provider differences belong behind the adapter layer, not in the locked frontend workflow.

## Provider architecture Phase 0.5
- Printful is now the second implemented provider path behind the normalized provider-core layer.
- This pass is limited to Printful Manual/API stores only.
- Ecommerce-platform sync store support is still a separate future integration track and is not part of the locked baseline.
- The frontend workflow remains frozen; provider differences continue to live behind the adapter layer.
- Current Printful adapter scope:
  - bearer-token validation through store discovery
  - store listing
  - store product listing as normalized selectable provider sources
  - single product detail normalization with placement/file/pricing hints when available
  - file library artwork upload path
  - Manual/API sync-product draft creation path
- Current Printful capability choices:
  - stores: yes
  - templates: no dedicated product-template API wiring in the locked frontend path yet
  - product drafts: yes
  - mockups/preview: not implemented in this pass
  - publish step: not implemented in this pass
  - multiple placements: not enabled in this pass

## Provider activation state
- Printify remains live in the locked UI.
- Printful is now unlocked in the current frontend provider flow and should no longer present as a coming-soon provider.
- Gooten, Apliiq, and SPOD / Spreadconnect remain implemented in backend, but they are not part of the current live user-facing provider queue.
- The connection, product loading, template detail, and draft-create requests now route through generic provider endpoints backed by the normalized provider registry.
- Gelato is the active next provider target, but it is currently held out of the locked frontend because the official Gelato create-from-template docs depend on dashboard-copied `storeId` and `templateId`, and we have not confirmed an official store-list or template-list API that fits the current dropdown UX cleanly.
- Prodigi remains backend-capable, but it stays on a separate order-first track and should not be surfaced in the locked store/template draft flow without an explicitly approved UX track for order-first providers.
- Lulu Direct and Merchize are removed from the active provider queue for this app and should not be shown as live or coming-soon promises in the locked frontend.

## Provider foundation after the first blocked rollout wave
- The frozen UI remains unchanged while provider-core foundation expands behind it.
- A backend-only hosted artwork bridge now exists so future providers can consume normalized public artwork references without changing the locked frontend artwork flow.
- The provider capability model now explicitly tracks:
  - `requiresHostedArtwork`
  - `supportsDirectUpload`
  - `supportsOrderFirst`
  - `supportsStoreTemplateDraftFlow`
- Printify and Printful remain on the current store/template draft flow with direct upload support.
- Future order-first providers should be added behind the provider-core layer without forcing storefront semantics into the UI before that flow is explicitly approved.
- Apliiq now uses that hosted artwork foundation as the first live provider that requires public HTTPS artwork:
  - credentials are backend-only `appKey:sharedSecret`
  - provider auth is HMAC-based and should never expose the shared secret client-side
  - the adapter normalizes one custom-store context from the supplied credentials
  - product catalog items are used as the selectable source path
  - create-design is the provider-equivalent draft output behind the current locked upload flow

## AI listing engine state on main
- The rebuilt AI listing engine now lives on `main` behind the preserved UI route contract at `app/api/ai/listing/route.ts`.
- The current route wrapper still accepts the existing frontend payload:
  - `imageDataUrl`
  - `title`
  - `fileName`
  - `productFamily`
  - `templateContext`
- The current route wrapper still returns the UI-safe response shape centered on:
  - `title`
  - `leadParagraphs`
  - `confidence`
  - `reasonFlags`
  - `model`
- Internal AI behavior is now image-first and marketplace-aware rather than filename-first or prompt-fragile.
- Current internal AI engine responsibilities on `main` include:
  - image-first extraction of visible text, visible facts, inferred meaning, audience, occasion, OCR weakness, and uncertainty
  - filename relevance scoring with explicit weak/generic handling, soft-support handling, and conflict severity / ignore behavior
  - semantic record generation for product noun, title core, benefit core, visible keywords, inferred keywords, and forbidden claim candidates
  - internal marketplace channel drafts for Etsy, Amazon, eBay, and TikTok Shop
  - validator grading with green / orange / red outcomes, confidence scoring, compliance flags, and structured internal reason details
  - deterministic fallback behavior when Gemini is unavailable or bounded structured-output retries fail
- The current engine is hardened with:
  - compliance rule packs for medical, licensing, certification, and guarantee-style claims
  - repetition / low-variety detection in titles, leads, and discovery terms
  - bounded Gemini retry behavior before fallback
  - locale-aware groundwork for later international output without changing the locked UI

## AI golden corpus regression state
- A small image-backed golden corpus now exists under `tests/ai/fixtures/golden-corpus/`.
- The corpus is intentionally small and high-signal, using real fixture images instead of only synthetic text cases.
- Current golden-corpus coverage includes representative ugly real-world cases such as:
  - readable design plus useless filename
  - useful filename plus weak image
  - transparent PNG weak contrast
  - partial / cropped slogan
  - filename conflict with visible text
  - text-only design
  - image-only design
  - minimal design
  - visually weak / low-information design
- AI tests now include real fixture-image regression coverage that asserts grade behavior, title behavior, lead behavior, filename handling, and route-contract-safe outputs without overfitting to one exact wording.

## Automation and smoke-test state
- A durable GitHub Actions smoke workflow now exists at:
  - `.github/workflows/merchquantum-smoke.yml`
- The smoke workflow currently supports:
  - scheduled twice-daily runs
  - manual dispatch
  - `npm ci`
  - `npx tsc --noEmit`
  - `npm run build`
  - focused provider smoke coverage through:
    - `npx --yes tsx tests/providers/provider-core.test.ts`
  - focused AI golden-corpus smoke coverage through:
    - `npx --yes tsx tests/ai/listing-engine.test.ts`
- A dedicated smoke-report generator now exists at:
  - `scripts/generate-smoke-report.mjs`
- Current smoke-report artifact behavior:
  - workflow captures provider and AI smoke logs
  - workflow generates a structured JSON current-run report
  - workflow uploads the `smoke-report/` artifact directory
  - the report includes workflow metadata, test outcomes, notable coverage notes, regression-oriented notes, and an honest non-historical delta scaffold
- Current limitation:
  - true run-to-run delta comparison is not wired yet because historical storage/comparison has not been added

## Future deployment direction
- Hostinger Cloud Startup / Web Apps Hosting is the current likely future managed production target.
- Vercel remains the temporary live/test layer until migration time.
- The Hostinger move should happen only after the app is mostly complete/stable and should be re-validated at migration time.
- Use `docs/HOSTINGER_CLOUD_STARTUP.md` as the planning note for that future move.

## Branch and automation direction
- Current durable supervision direction is:
  - repo-native memory and operating docs
  - twice-daily smoke workflow
  - structured smoke-report artifact generation
- Next likely durable supervision layers:
  - smoke-summary / run-to-run comparison layer
  - PR gate workflow on protected branches
  - task/reporting layer for daily summaries and flagged regressions
- Future infrastructure direction after those layers:
  - Hostinger Cloud Startup migration validation when the app is ready
- Keep these as coherent infrastructure passes. Do not mix them casually with UI, provider, or AI behavior work.

## Legacy control-doc handling
- If a control or recovery document is superseded later, move it to `docs/legacy/` rather than leaving it in active locations with unclear status.
- Do not create placeholder legacy files.
- Keep active control docs short, current, and authoritative.

## Restart notes for the next Codex session
1. Read `AGENTS.md` first and this file second.
2. Treat the accepted frozen UI baseline above as the default no-regression state.
3. If the task is provider expansion, start in `lib/providers/*` and preserve the locked frontend.
4. Use `app/components/MerchQuantumApp.tsx` as the default primary target only for explicitly requested UI work.
5. Before any new patch, separate current deployed state, current repo state, and approved target state.
6. Patch only the named section and treat untouched sections as read-only.

## Restart workflow for a fresh Codex session
1. Open the MerchQuantum repo in Codex.
2. Make sure `AGENTS.md` is at the repo root.
3. Make sure this file exists at `docs/MERCHQUANTUM_RECOVERY.md`.
4. Use the clean repo path only:
   - `C:\Users\prog\OneDrive\Documents\New Project`
5. Do not use the older polluted local repo folder.
6. In the prompt, name the exact section to patch.
7. Require file-minimal delivery only.
8. Require install, typecheck, and production build before handoff.

## Practical truth
This file does not guarantee perfection. It provides the strongest repo-native restart path so future work can re-anchor to the same baseline and the same no-regression rules without relying on PDF or chat memory.
