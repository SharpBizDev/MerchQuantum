# PROMPT_PLAYBOOK.md: AGENT BEHAVIOR TEMPLATES

## 1. THE SYSTEM DEFAULT
All code generation must adhere to the **KISS Model** and **8px Golden Token** spacing. No "status bloat" or excessive console logging.

## 2. THE F.O.R.C.E. COMMAND
If an agent provides a plan without a critique, the user triggers:
> "Run F.O.R.C.E. Protocol on this plan now."

## 3. UI/UX DESIGN TOKENS
- **Borders:** Unified `border-gray-200` (or similar).
- **Layout:** Flex/Grid only. Responsive centering required.
- **Feedback:** Use subtle toast notifications or inline text—never block the UI with "AI thinking" overlays.

## 4. REPO-SYNC COMMANDS
Every file operation must be accompanied by the exact PowerShell command to:
1. Verify the location (e.g., `cd docs`).
2. Add, Commit, and Push the change.

---
*Status: FINALIZED. Last Truth Pass: April 2026*