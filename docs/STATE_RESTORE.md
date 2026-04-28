# STATE_RESTORE.md: TECHNICAL SNAPSHOT

## 1. THE STACK (KISS COMPLIANT)
- **Framework:** Next.js (App Router)
- **Styling:** Tailwind CSS (8px Golden Token Standard)
- **State:** React Context / Lucide Icons
- **AI Integration:** Registry-Adapter Pattern (Gemini/Grok/Codex)

## 2. KEY PATHS (CURRENT TRUTH)
- **Logic Engine:** `lib/engines/listing-engine.ts`
- **AI Governor:** `lib/providers/governor.ts`
- **UI Entry:** `app/dashboard/page.tsx`
- **Doc Center:** `/docs` (8/8 Core Files)

## 3. CRITICAL ENVIRONMENT VARS
Ensure the following are present in `.env.local` before execution:
- `GEMINI_API_KEY`
- `GROK_API_KEY`
- `VERCEL_DEPLOY_HOOK` (if applicable)

## 4. CURRENT BUILD STATE
- **Last Refactor:** Unified borders & AI Bloat removal.
- **Next Task:** High-density Listing Engine audit.

---
*TIMESTAMP: APRIL 27, 2026 | SESSION CONTINUITY: SECURED*