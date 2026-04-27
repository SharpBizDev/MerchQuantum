# MERCHQUANTUM_RECOVERY.md: STATE RESTORATION

## 1. PURPOSE
This document is the "Black Box" of MerchQuantum. It contains the hard-won technical truths discovered during the build to prevent regression and "Agent Drift."

## 2. SESSION REHYDRATION CHECKLIST
When starting a new session, the agent must verify the following constants:
1. **The Registry Rule:** All providers must be initialized through `lib/providers/registry.ts`.
2. **The Governor Guard:** The `governor.ts` is the single source of truth for rate-limiting.
3. **UI Integrity:** 8px/12px spacing is the standard.

## 3. HARD-WON TRUTHS (PREVENT REGRESSION)
- **Listing Engine Logic:** Do not attempt to "simplify" the bulk processing loops in `listing-engine.ts`. 
- **CSS Strategy:** We use Tailwind with unified container borders. No "AI status bloat."
- **Model Context:** The Model Context Protocol (MCP) is the bridge. Keep plugin definitions modular.

## 4. EMERGENCY PROTOCOLS
- **If the Agent Drifts:** Command: "REVERT TO MANIFEST P0."
- **If API Costs Spike:** Audit the `governor.ts` call stack.

---
*Status: STABLE. Last Truth Pass: April 2026*