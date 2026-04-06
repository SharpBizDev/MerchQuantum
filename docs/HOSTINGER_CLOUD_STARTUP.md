# Hostinger Cloud Startup Future Deployment Notes

This document records the current planned future deployment direction for MerchQuantum without changing the current deployment behavior.

## Current position
- Hostinger Cloud Startup / Web Apps Hosting is the likely future managed production target.
- Vercel remains the current temporary live/testing environment.
- Hostinger migration is intentionally deferred until the app is mostly complete and stable.

## Current managed-hosting assumptions
- Managed Node.js web app hosting is available on Hostinger web-app hosting / supported cloud plans.
- GitHub-connected deployment is a primary expected path.
- ZIP upload is the practical fallback deployment path.
- Framework auto-detection is part of the managed deployment flow.
- This is a managed environment, not a VPS/root-access workflow.

## Practical suitability for MerchQuantum
- Hostinger Cloud Startup looks like a plausible fit for managed deployment of MerchQuantum if the app remains compatible with its Node.js web-app flow.
- It is likely simpler than VPS administration for this project if managed deployment behavior remains stable at migration time.
- The migration path still needs to be re-verified at the moment of migration rather than assumed from earlier planning notes.

## Migration-time validation checklist

### Build and start compatibility
- Confirm the current Next.js app builds cleanly under the selected Hostinger Node.js runtime.
- Confirm the expected build/start commands align with Hostinger’s managed web-app flow.
- Confirm no platform-specific assumptions from Vercel remain hidden in the app.

### Environment variable handling
- Confirm all required app, provider, and AI environment variables can be set and updated cleanly.
- Confirm env changes trigger a reliable redeploy/restart flow.
- Confirm secrets remain server-side and do not leak into client bundles.

### Private GitHub repo connection
- Confirm Hostinger can connect to the private GitHub repo cleanly.
- Confirm branch selection and deployment source behavior are explicit and predictable.
- Confirm redeploy behavior from later commits is reliable.

### Domain and SSL
- Confirm domain mapping steps for the future production domain.
- Confirm managed SSL issuance/renewal behavior.
- Confirm redirects and canonical host behavior after cutover.

### Preview / staging expectations versus Vercel
- Confirm whether Hostinger offers branch-preview or staging behavior comparable to current Vercel workflows.
- If not, plan for a simpler production-only or manual-staging workflow.
- Treat this as an operational tradeoff to verify, not a blocker by default.

### Caching and stale-deploy checks
- Confirm build output and CDN/cache invalidation behavior after redeploys.
- Confirm the app does not continue serving stale code or stale assets after a successful deployment.
- Add a post-migration redeploy check for cache freshness.

### Rollback and redeploy checks
- Confirm how fast a rollback can be performed.
- Confirm whether rollback is version-based, Git-based, or manual redeploy based.
- Confirm the operational path for “known good deploy” recovery.

### Background-process limitations
- Confirm whether any future background jobs, scheduled work, long-running workers, or queue consumers fit the managed web-app model.
- If durable background work becomes important later, re-evaluate whether it belongs on Hostinger managed hosting or a separate worker/service layer.

### Multi-app coexistence on the plan
- Confirm how many managed Node.js web apps can coexist cleanly on the chosen plan.
- Confirm whether MerchQuantum and related future apps can share the plan without resource contention or deployment confusion.
- Confirm the operational boundaries for domains, env vars, and GitHub connections across multiple apps.

## Known risks and things to re-check at migration time
- Managed platform features may change, so exact Node/runtime behavior should be re-verified at migration time.
- GitHub integration, caching, or redeploy behavior can be more opinionated than Vercel’s model.
- Preview/staging support may be weaker or more manual than the current Vercel workflow.
- Environment-variable and cache invalidation quirks should be re-tested during the real migration window.
- If MerchQuantum later needs stronger background-job or multi-service behavior, Cloud Startup suitability should be revisited before final cutover.

## Current planning rule
- Treat Hostinger Cloud Startup as the primary future managed path.
- Treat VPS as a secondary fallback path only if the managed deployment path proves incompatible at migration time.
