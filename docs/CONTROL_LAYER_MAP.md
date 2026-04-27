# CONTROL_LAYER_MAP.md: SYSTEM LEVERS

## 1. PURPOSE
This map identifies the specific files that control global behavior. Changing these files alters the entire application's "DNA."

## 2. THE CONTROL HIERARCHY
1. **Supreme Law:** `MERCH_QUANTUM_MANIFEST.md` (Root)
   - *Constraint:* Never bypass the P0 Threat Matrix.
2. **Operational Guard:** `AGENTS.md` (Root)
   - *Constraint:* Mandates the F.O.R.C.E. Protocol.
3. **Execution Gate:** `lib/providers/governor.ts`
   - *Constraint:* Controls all API spend and rate-limiting.

## 3. UI & BRANDING LEVERS
- **Theming/Tokens:** `tailwind.config.ts` & `styles/globals.css`.
- **Layout Standards:** `components/layout/` (Ensures 8px/12px compliance).
- **Global State:** `lib/store/` (If applicable, ensure KISS-compliant state).

## 4. PROVIDER REGISTRY
- **Gatekeeper:** `lib/providers/registry.ts`
- **Adapters:** `lib/providers/adapters/` (Add new models here).

---
*Status: ACCURATE. Last Truth Pass: April 2026*