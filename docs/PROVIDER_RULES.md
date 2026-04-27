# PROVIDER_RULES.md: MODEL GOVERNANCE

## 1. THE GOLDEN RULE
Direct API calls from the Frontend or UI Components are STAGE 1 VIOLATIONS. All model traffic must flow through:
`UI -> Registry -> Governor -> Adapter -> Endpoint`

## 2. GOVERNOR CONSTRAINTS
- **Rate Limiting:** Every call must be checked against the `governor.ts` budget.
- **Fallbacks:** If Gemini fails, the Registry must attempt a fallback to the secondary provider (Codex/Grok) ONLY if the cost-profile allows.

## 3. ADAPTER STANDARDS
- **Normalization:** Every Adapter must return a `QuantumResponse` object.
- **No Hallucinations:** Adapters must catch and log 400/500 errors locally before returning a sanitized "Fail" state to the UI.

## 4. SECURITY & KEYS
- Never hardcode keys. Use `.env.local` strictly.
- Verify `process.env` availability in the Governor before execution.

---
*Status: ENFORCED. Last Truth Pass: April 2026*