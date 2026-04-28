# ARCHITECTURE.md: SYSTEM TOPOLOGY

## 1. THE REGISTRY-ADAPTER MODEL
All marketplace interactions are decoupled from core business logic.

## 2. PROVIDER STRUCTURE (VERIFIED)
Adapters are not centralized; they are encapsulated by provider:
- `lib/providers/printify/adapter.ts`
- `lib/providers/printful/adapter.ts`
- `lib/providers/gooten/adapter.ts`
- `lib/providers/apliiq/adapter.ts`
- `lib/providers/spod/adapter.ts`
- `lib/providers/prodigi/adapter.ts`

## 3. THE GOVERNANCE LAYER
`lib/providers/governor.ts` acts as the mandatory gatekeeper for all LLM calls to prevent token waste and ensure model-specific rule compliance.

## 4. DATA FLOW
UI (`app/page.tsx`) -> Engine (`lib/ai/listing-engine.ts`) -> Governor -> Adapter -> Marketplace API.

---
*STATUS: RE-INDEXED & ACCURATE*