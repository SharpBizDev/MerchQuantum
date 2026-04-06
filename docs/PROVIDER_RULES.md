# MerchQuantum Provider Rules

This document defines the current provider philosophy and no-drift rules for provider work.

## Provider philosophy
- Keep provider differences behind the normalized provider-core layer.
- Do not force provider-specific complexity into the locked frontend unless explicitly approved.
- Preserve draft-first behavior unless the user explicitly requests a different fulfillment flow.
- Treat provider additions as backend contract work first, UI expansion second.

## Repo-truth provider state

### Active in the current client/provider flow
- Printify
- Printful
- Gooten
- Apliiq
- SPOD / Spreadconnect

### Implemented in backend, but not currently presented as live in the locked frontend
- Prodigi

### Not yet implemented/live
- Gelato
- Lulu Direct

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
