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

## Mission-critical operating rule
Future sessions must treat the GitHub repo plus the live app as the baseline reality, inspect the latest repo state first, patch only the section explicitly requested, test locally before delivery, and avoid broad cleanup passes that reintroduce regressions.

## Core file map
- `app/components/MerchQuantumApp.tsx` — main client UI and workflow logic
- `app/api/printify/connect/route.ts` — validate Printify token and populate shops
- `app/api/printify/disconnect/route.ts` — clear stored Printify token cookie
- `app/api/printify/products/route.ts` — list shop products
- `app/api/printify/product/route.ts` — load one product and derive placement guidance
- `app/api/printify/batch-create/route.ts` — upload artwork, apply placement, create drafts
- `app/api/ai/listing/route.ts` — AI rewrite endpoint with Gemini / fallback behavior

## Printify integration truths
- The live backend is Printify-first.
- UI labels may mention Printful, Gelato, and others, but server routes are currently Printify-scoped.
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
- The connection, product loading, template detail, and draft-create requests now route through generic provider endpoints backed by the normalized provider registry.
- Other providers remain gated until explicitly implemented and approved.

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
4. In the prompt, name the exact section to patch.
5. Require file-minimal delivery only.
6. Require install, typecheck, and production build before handoff.

## Practical truth
This file does not guarantee perfection. It provides the strongest repo-native restart path so future work can re-anchor to the same baseline and the same no-regression rules without relying on PDF or chat memory.
