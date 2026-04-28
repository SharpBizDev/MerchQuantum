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

## 3. THE GOVERNANCE LAYER (CURRENT PHYSICAL STATE)
- **Provider Traffic:** `lib/providers/governor.ts` acts as the mandatory gatekeeper for all marketplace and provider fulfillment operations.
- **AI Traffic:** `lib/ai/listing-engine.ts` currently handles AI LLM generation traffic directly (it bypasses the governor).

## 4. DATA FLOW
- **Generation Path:** UI (`app/page.tsx`) -> Engine (`lib/ai/listing-engine.ts`) -> Direct LLM API.
- **Fulfillment Path:** UI -> Governor (`lib/providers/governor.ts`) -> Adapter -> Marketplace API.

---
*STATUS: RE-INDEXED & ABSOLUTE*