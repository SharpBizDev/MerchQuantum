# MerchQuantum Architecture

This document explains the practical current structure of MerchQuantum so future work can extend the repo without drifting from the working baseline.

## System overview
MerchQuantum is a draft-first product creation app built on Next.js, React, and TypeScript. The current baseline is a locked frontend workflow backed by a normalized provider-core layer and an image-first AI listing engine.

## Core layers

### 1. UI layer
- Main client surface: `app/components/MerchQuantumApp.tsx`
- Responsibilities:
  - provider selection and connection flow
  - shop and product/template selection
  - batch image upload and preview
  - listing-detail review surface
  - draft-upload orchestration
- Rule: the frontend is intentionally concentrated in one main component, so changes should be narrow and explicit.

### 2. Provider connection and product retrieval layer
- Generic provider routes live under `app/api/providers/*`
- Provider adapters and contracts live under `lib/providers/*`
- Responsibilities:
  - connect/disconnect providers
  - load shops or equivalent store contexts
  - list products/templates
  - normalize product detail and placement guidance
  - upload artwork or hosted-artwork references
  - create draft-equivalent provider outputs
- Legacy compatibility routes under `app/api/printify/*` still exist, but the normalized provider-core path is the practical backend direction.

### 3. AI listing engine layer
- Route wrapper: `app/api/ai/listing/route.ts`
- Engine implementation: `lib/ai/listing-engine.ts`
- Responsibilities:
  - image-first visible-text and visual-meaning extraction
  - filename relevance and conflict handling
  - semantic record construction
  - marketplace draft generation
  - validator grading and reason signaling
  - deterministic fallback behavior
- Rule: preserve the current UI-safe response contract even when internal AI behavior evolves.

### 4. Tests and fixtures layer
- AI tests: `tests/ai/listing-engine.test.ts`
- Golden corpus manifest: `tests/ai/fixtures/golden-corpus.ts`
- Golden corpus fixture images: `tests/ai/fixtures/golden-corpus/*`
- Provider regression tests: `tests/providers/provider-core.test.ts`
- Responsibilities:
  - protect the AI route contract
  - protect provider adapter behavior
  - preserve image-backed AI quality regression coverage
- Rule: preserve the existing golden corpus and extend it carefully instead of replacing it casually.

### 5. Deployment and testing layer
- Package/runtime control: `package.json`, `package-lock.json`
- CI/workflow layer: `.github/workflows/*`
- Current repo smoke workflow scaffold: `.github/workflows/merchquantum-smoke.yml`
- Responsibilities:
  - install and build stability
  - scheduled smoke testing
  - PR gate expansion later

## Request flow at a glance
1. User connects a provider in the UI.
2. The UI loads shops/store contexts and products through the provider-core routes.
3. The user uploads artwork and selects a product/template context.
4. The UI posts listing input to `app/api/ai/listing/route.ts`.
5. The AI engine returns UI-safe listing data.
6. Draft upload routes send normalized output through the selected provider adapter.

## Provider/runtime reality
- Printify remains a key compatibility and draft-first path.
- Provider execution increasingly routes through the generic provider-core backend.
- Some providers are implemented in the registry even if they are not yet fully active in the locked frontend flow.

## Deployment reality
- Vercel is the temporary live/test deployment layer for now.
- Treat Vercel as an execution and verification environment, not the long-term platform decision.
- Hostinger Cloud Startup / Web Apps Hosting is the current likely future managed production target.
- VPS is a secondary fallback path, not the primary future plan.
- Future migration work is later work and not part of the current architecture baseline.

## Change discipline
- UI work should usually stay inside `app/components/MerchQuantumApp.tsx`.
- Provider work should usually stay inside `lib/providers/*` and `app/api/providers/*`.
- AI work should usually stay inside `lib/ai/listing-engine.ts`, `app/api/ai/listing/route.ts`, and the focused AI tests.
- Workflow/docs changes should stay isolated from app behavior.
