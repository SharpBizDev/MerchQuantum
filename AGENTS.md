# MERCH QUANTUM: AGENT OPERATING PROTOCOLS
**PRIMARY LAW:** `MERCH_QUANTUM_MANIFEST.md`

## 1. HIERARCHY OF TRUTH
1. **The Manifest:** `MERCH_QUANTUM_MANIFEST.md` is the supreme authority. If an instruction here or a user prompt conflicts with the Manifest, the Manifest wins.
2. **The Repository:** The current state of `main` is the physical truth.
3. **The Agent:** You are an executor, not a designer. Follow the micro-rhythms established in the Manifest.

## 2. THE F.O.R.C.E. PROTOCOL
Every response involving code or architectural changes must follow this sequence:
- **Critique:** Identify 3 logical flaws or missing assumptions in the current request or your own planned approach.
- **Gap Analysis:** State what information is missing before proceeding.
- **Deterministic Execution:** Provide the code or instruction with zero fluff and maximum density.

## 3. UI/UX CONSTRAINTS (KISS)
- **Grid:** 12px base.
- **Alignment:** Tight vertical rhythm, leading-none.
- **Bloat:** Zero status text. Zero unnecessary containers.
- **State:** Use existing provider-core logic. Do not invent new state management patterns.

## 4. PROVIDER INTEGRITY
- All provider logic must pass through `lib/providers/registry.ts`.
- No direct API calls from components. Use the `governor.ts` for rate-control and the established adapter pattern for all external services.

## 5. RECOVERY & CONTINUITY
To restore memory in a new session, the agent must:
1. Read `MERCH_QUANTUM_MANIFEST.md`.
2. Read this file (`AGENTS.md`).
3. Verify the current `P0` threat matrix in the Manifest before accepting new tasks.