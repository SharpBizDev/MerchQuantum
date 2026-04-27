# MERCH QUANTUM: CORE SYSTEM MANIFEST
**STATUS:** ACTIVE MEMORY RESTORE POINT / UNYIELDING

## 1. THE F.O.R.C.E. EXECUTION MANDATE (ABSOLUTE LAW)
All future AI code generation MUST strictly adhere to the "F.O.R.C.E. Enterprise Framework Execution." 
- **MANDATE:** You will not write a single line of code without first critiquing your own plan for logical flaws, edge cases, and missing assumptions. 
- You must identify gaps with clinical precision before executing any code changes. Do not soften criticism. 
- You are strictly forbidden from being lazy, skipping text, making assumptions, or taking shortcuts.
- [cite_start]**Validation:** Deterministic validation is the expected standard for both code paths and output contracts[cite: 1].

## 2. PROJECT IDENTITY & PHILOSOPHY
- [cite_start]**Name:** Merch Quantum [cite: 1]
- [cite_start]**Paired Intelligence Layer:** ContextQuantum [cite: 1]
- [cite_start]**Application Type:** Draft-first print-on-demand workflow app with AI-assisted listing generation and provider-backed product creation[cite: 1].
- [cite_start]**Core Integrations:** Printify (API Proxy), Next.js App Router, Vercel, Stripe, and xAI endpoints[cite: 35].
- [cite_start]**Operating Philosophy:** The KISS model, zero-bloat, strict efficiency[cite: 1]. [cite_start]Keep the app narrow, dense, and operationally honest[cite: 1].
- [cite_start]**Code Execution:** Preserve working behavior before chasing elegance[cite: 4]. [cite_start]Treat GitHub `main` as repo truth when local history gets noisy[cite: 5].

## 3. IMMEDIATE THREAT MATRIX (P0/P1 PRIORITIES)
**CRITICAL MANDATE: DO NOT BUILD NEW FEATURES UNTIL THESE ARE RESOLVED.** The current repository contains the following critical tech debt:
* [cite_start]**[P0] CRITICAL COST-ABUSE RISK:** Unauthenticated/Unthrottled public access on `/api/ai/listing` and `/api/refinery/yaml-agent`[cite: 36]. [cite_start]Requires immediate authenticated access, per-IP/session rate limiting, and request-size gating before model calls[cite: 37].
* [cite_start]**[P1] SECURITY LEAK:** Provider credentials dangerously stored in browser plain-text `localStorage`[cite: 38]. [cite_start]Must be completely removed and rely solely on the existing HTTP-only server cookies[cite: 38].
* [cite_start]**[P1] TIMEOUT TRAP:** Governor logic (`lib/providers/governor.ts`) causing intra-request batch timeouts in serverless execution windows[cite: 39]. [cite_start]Rate control must move to smarter retry/backoff or queued orchestration[cite: 40].
* [cite_start]**[P1] STATE GHOSTING:** Hidden `apiStatus` setter state silently suppressing workflow progression in `MerchQuantumApp.tsx` despite visible UI text being removed[cite: 40, 41].

## 4. UI/UX MICRO-RHYTHMS & PHYSICS
- [cite_start]**Grid & Spacing:** Strict 12px "Golden Token" base utility size with `leading-none` tight line-height[cite: 8]. [cite_start]6px border radii, 1px border weight (`gray-600/50`)[cite: 8]. [cite_start]Padding must stay minimal and symmetrical[cite: 10].
- [cite_start]**Layout & Structure:** Flush container borders[cite: 8]. [cite_start]The Tag-chip baseline is the visual reference for compact interactive controls[cite: 9]. [cite_start]Avoid tall header-row controls[cite: 11].
- [cite_start]**Feedback Philosophy:** Silent error UI[cite: 14]. [cite_start]No dynamic status text bloat, red warning blocks, or internal system jargon exposed to the client[cite: 15, 16]. [cite_start]Rely strictly on established indicators (e.g., thumbs-down icons, disabled controls)[cite: 16].
- [cite_start]**Physics & Motion:** Pure CSS `scroll-snap` and native overflow control are MANDATORY[cite: 12]. [cite_start]Zero JS animations (e.g., Framer Motion) or theatrical movements unless explicitly demanded[cite: 13].
- [cite_start]**Interaction States:** `purple-400` text is the preferred accent for active/ready elements[cite: 11]. [cite_start]`bg-gray-800/80` for base/inactive state elements[cite: 11].

## 5. ARCHITECTURE & STATE BOUNDARIES
* [cite_start]**The High-Risk Surfaces:** `app/components/MerchQuantumApp.tsx` (UI/State) and `lib/ai/listing-engine.ts` (AI Engine) are massive (4,000+ lines) and extremely coupled[cite: 7]. [cite_start]Future work must assume extreme coupling and proceed carefully[cite: 7].
* [cite_start]**Shared Logic:** Create and Edit modes are not isolated; they share major logic inside `MerchQuantumApp.tsx`[cite: 23]. [cite_start]Any control added must be evaluated for parity across both contexts[cite: 25].
* [cite_start]**Execution Rules:** Surgical edits only[cite: 28]. [cite_start]Inspect nearby state and derived values before changing any JSX node[cite: 29]. [cite_start]When removing UI copy, you must verify if a removed UI node still has hidden state or orphaned effects attached[cite: 31, 52]. [cite_start]Uncontrolled "cleanup" or broad refactors are strictly prohibited[cite: 31, 33].

## 6. SYSTEM WARNINGS
* [cite_start]**Security:** A real-looking `XAI_API_KEY` was observed in `.env.local`[cite: 42]. [cite_start]Treat as sensitive and rotate[cite: 43].
* [cite_start]**Hygiene:** Resolve workspace path drift (`New Project` vs `New project`)[cite: 44]. [cite_start]Return to narrow PR-first publication units[cite: 46].
* [cite_start]**Legacy Check:** Printify logic exists in both legacy (`app/api/printify/*`) and normalized provider-core paths[cite: 47]. [cite_start]Any change must be checked for drift across both[cite: 47].
* [cite_start]**Dormant Features:** The YAML refinery path is not wired into the live UI and is either dormant debt or requires security hardening[cite: 48].

## 7. SESSION CONTINUITY & FINAL DIRECTIVE
- [cite_start]**The Visual Truth:** Visual parity must be based on the rendered result, not just class-token similarity[cite: 50]. 
- [cite_start]**The Execution Order:** Read this manifest, then `AGENTS.md`, then `docs/MERCHQUANTUM_RECOVERY.md`[cite: 51]. [cite_start]Change one thing at a time[cite: 52]. [cite_start]Protect cost surfaces first[cite: 53].