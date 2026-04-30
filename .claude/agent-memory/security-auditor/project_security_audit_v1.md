---
name: Security Audit v1 — Okany Sync
description: Findings and verified controls from the first full security audit of Okany Sync (2026-04-29)
type: project
---

First full security audit completed 2026-04-29. Report at docs/informe_seguridad_v1.md.

**Critical finding (open):** IDOR in `convex/transactions.ts` `listByAccountMonth` — the post-query filter `t.accountId === accountId` is always true (it was the index key), so any authenticated user can read all transactions for any account by ID. Fix: add `assertCanRead(ctx, accountId)` and drop the filter.

**High findings (open):**
- HTML injection in `convex/lib/emailTemplates.ts` — `name` and `signInUrl` interpolated raw into HTML. Fix: escape with a custom `escapeHtml()` helper.
- No backend validation of value bounds (amounts, string lengths, currency format) in any Convex handler — Zod schemas in `src/lib/validators.ts` are frontend-only and never enforced server-side.
- `limit` args in `transactions.listRecent` and `notifications.listRecent` have no upper bound — client can trigger full table scans.
- No Content Security Policy header in `next.config.ts`.

**Medium findings (open):**
- User enumeration via error messages in `accountShares.share`.
- No rate limiting on any Convex endpoint.
- Last-admin self-demotion not blocked in `users.updateByAdmin`.
- PII (email) logged in Convex logs via `deleteUserCascade` and `sendWelcomeEmail`.
- `monthlySummary` accepts unbounded `months` array.
- `VAPID_SUBJECT` has hardcoded fallback email.

**Low findings (open):**
- `src/proxy.ts` should be renamed to `src/middleware.ts` (works now with Turbopack but non-standard).
- `users.getByClerkId` is a public query returning full user doc by any clerkId — should be internal or auth-checked.

**Verified as correct:**
- Webhook signature validation (svix, all 3 headers).
- `src/proxy.ts` IS the actual middleware (confirmed in .next/dev build).
- Auth in Convex (`getCurrentUser`): validates JWT, user existence, active status.
- Account sharing permissions system (owner/admin/editor/viewer).
- Admin role checks in all admin endpoints.
- .gitignore covers all secret files.
- NEXT_PUBLIC_VAPID_PUBLIC_KEY exposure is intentional and correct.
- Security headers: X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy.
- Sentry replay with maskAllText + blockAllMedia.
- No dangerouslySetInnerHTML in any React component.
- No SQL injection risk (Convex SDK only).
- npm audit: 0 critical/high, 8 moderate.

**Why:** First audit, establishes baseline. Codebase is a personal finance PWA with shared accounts feature — IDOR finding is the highest priority given financial data sensitivity.

**How to apply:** In future sessions, start remediation with C-1 (IDOR) and A-1 (HTML injection) before any production deployment.
