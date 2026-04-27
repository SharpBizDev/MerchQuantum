# ARCHITECTURE.md: SYSTEM TOPOLOGY

## 1. THE CORE ENGINE
MerchQuantum is built on a "Registry-First" architecture. All model interactions are decoupled from the UI to ensure 100% portability and cost control.

## 2. DATA FLOW HIERARCHY
1. **The Governor:** (`lib/providers/governor.ts`)
   - The entry point for all API requests. 
   - Manages rate-limiting and token budgets.
2. **The Registry:** (`lib/providers/registry.ts`)
   - Maps the intent to the specific Model Adapter.
3. **The Adapters:** (`lib/providers/adapters/`)
   - Standardizes inputs/outputs for Gemini, Codex, and Grok.

## 3. THE LISTING ENGINE
- **Location:** `lib/engines/listing-engine.ts`
- **Logic:** Manages bulk transformation of product metadata (SEO, titles, descriptions).
- **Constraint:** Uses a non-blocking queue to prevent marketplace timeouts.

## 4. UI/UX STANDARDS (KISS)
- **Framework:** Next.js + Tailwind CSS.
- **Spacing:** 8px base (Golden Token).
- **Philosophy:** Zero "AI Status Bloat." All state feedback must be compact and flush with container borders.

## 5. INFRASTRUCTURE
- **Hosting:** Vercel (Production) / GitHub (Truth).
- **State:** Local-first, synced via Git.

---
*Status: VERIFIED. Last Truth Pass: April 2026*