# MerchQuantum Provider Rules

This document defines the current provider philosophy and no-drift rules for provider work.

## Provider philosophy
- Keep provider differences behind the normalized provider-core layer.
- Do not force provider-specific complexity into the locked frontend unless explicitly approved.
- Preserve draft-first behavior unless the user explicitly requests a different fulfillment flow.
- Treat provider additions as backend contract work first, UI expansion second.

## Repo-truth provider state

### Active in the current live user-facing provider flow
- Printify
- Printful
- Gooten
- Apliiq
- SPOD / Spreadconnect

### Implemented in backend, but intentionally held out of the live provider queue
- Gelato
- Prodigi

### Removed from the active queue for this app
- Lulu Direct
- Merchize

## Current queue decisions
- Gooten, Apliiq, and SPOD / Spreadconnect remain active in the current live user-facing provider queue.
- Gelato is not part of the live provider queue or active workflow for this app. Its official create-product flow still depends on dashboard-copied `templateId` and `storeId`, and we do not have an official store-list or template-list API fit for the locked dropdown UX. Do not guess around that gap with undocumented endpoints or fake synthetic stores.
- Prodigi is not part of the live provider queue or active workflow for this app. It stays on a separate order-first track because its official fit is order submission and product SKU selection rather than the current store/template draft-product flow.
- Lulu Direct and Merchize are not active roadmap promises for this app. Keep them out of the locked frontend provider list unless a later pass adds a real adapter, route support, regression coverage, and approved UX language.

## Current provider flow assumptions
- The user connects one provider at a time.
- The provider returns shops, stores, or an equivalent store context.
- The UI selects a shop/store context first, then lists products/templates tied to that context.
- Template/product detail is normalized before AI generation and draft creation.
- Draft creation remains the preferred outcome.
- Providers that require hosted artwork should consume normalized hosted artwork references behind the backend, not through a UI redesign.

## Shop / product / template flow assumptions
- The user-facing flow is intentionally simple.
- Backend assumptions may still refer to product source types, template details, or store-template draft flow.
- Those backend distinctions must stay behind the provider-core layer unless the user explicitly approves exposing them in UI language.

## No-drift rules for provider work
- Do not change provider connection semantics casually.
- Do not expose raw provider jargon in the locked frontend unless explicitly requested.
- Do not add a provider to the live UI flow unless all of the following exist:
  - adapter implementation
  - normalized capability mapping
  - route support
  - focused provider regression coverage
  - approved UX language
- Do not change untargeted provider adapters while implementing one provider.
- Do not mix provider expansion with unrelated AI or UI changes unless explicitly approved.

## Validation expectations for provider changes
- `npx tsc --noEmit`
- `npm run build`
- `npx --yes tsx tests/providers/provider-core.test.ts`
- confirm no UI drift
- confirm no AI drift

## Safe provider-change checklist
1. Update or add the adapter.
2. Update capability declarations only if required.
3. Keep route contracts normalized.
4. Add or update focused provider tests.
5. Validate without touching unrelated providers.
