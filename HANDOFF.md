# Consulten — Handoff Context

Current state of the build as of 2026-07-22. Update this file when milestone status changes or decisions are reversed.

---

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 Backend (Plan A) | ✅ Complete | All 15 tasks: schema, services, state machines, auth, CI, seed, tests |
| M1 Admin UI (Plan B) | ✅ Complete | All 11 tasks: 10 module CRUD pages + dashboard, pushed to GitHub |
| M2+ | Not started | |

M1 is the full spine: a founder can drive a project from creation through engagement closeout using the admin UI. No client or consultant UI exists yet.

---

## What's Working

- **Admin UI** at `/admin/` — login with a Clerk account that has `role: admin` in `publicMetadata`
- **Dashboard** shows live entity counts with links to each module
- **All module list + detail pages** with state-machine-driven action buttons
- **Server Actions** — clicking an action button calls the service, transitions state, logs an event, redirects
- **Event log** — every state transition is recorded in `eventLog`; visible on each detail page and at `/admin/events`
- **Integration tests** — 2 test files, 5 tests, all pass against the real Neon dev DB
- **CI** — GitHub Actions runs lint → typecheck → test → build on every push

---

## Infrastructure

| Resource | Details |
|----------|---------|
| GitHub repo | `https://github.com/aabbottbos/c0nsult3n` (personal account `aabbottbos`) |
| Neon project | ID `blue-cherry-03073401`, region `us-west-2` |
| Neon DB | `neondb` on branch `main` |
| Vercel | Not yet deployed |
| Clerk | Dev instance configured; webhook route at `/api/webhooks/clerk` |
| Sentry | Configured in `sentry.*.config.ts`; DSN in `.env.local` |

**Database connection string** (pooled, for app + tests):
```
postgresql://neondb_owner:npg_sPwSOVEzG6W2@ep-quiet-night-afjrij5d-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```
This goes in both `.env` (for Vitest/seed) and `.env.local` (for Next.js dev).

---

## Known Gaps / Intentional Deferrals

These are real, not forgotten — they're MVP B or below the M1 bar:

- **No client or consultant UI.** The routes are locked (redirect to `/`) but the pages are not built.
- **`listScopes`, `listShortlists`, `listDeliverables` not in service layer.** The admin list pages for these three modules query `db` directly. Acceptable for now; add service functions before any non-admin code needs them.
- **`/admin/ai-outputs` is absent.** Nav link was removed. No AI features exist in M1.
- **No email sending.** `sendInvitation` transitions state but does not actually email the consultant.
- **No file uploads.** `deliverable.fileUrl` is nullable and unused; upload flow is MVP B.
- **No payments.** The full Stripe integration is MVP B.
- **Seed data may be present in the DB.** Running `npx prisma db seed` from the build dir adds test data. The integration test `afterEach` cleans up its own records but doesn't touch manually seeded rows. Run a manual `TRUNCATE` via Neon MCP if the DB gets dirty before testing.

---

## Auth Setup Notes

Clerk roles are set via `publicMetadata.role` on the user object in the Clerk dashboard. The middleware at `middleware.ts` protects all routes. Role-checking uses `requireRole(role)` from `lib/auth.ts`, which reads `sessionClaims.metadata.role`.

To create an admin user for testing:
1. Sign up at the dev Clerk instance
2. In Clerk Dashboard → Users → select user → Metadata → set `publicMetadata`: `{"role": "admin"}`

---

## Push Procedure

This `build/` directory is a subdirectory of a larger parent git repo. Standard `git push` won't work from here. Always push via:

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```

The `consulten` remote points to `https://github.com/aabbottbos/c0nsult3n.git` and is configured on the parent repo (not this directory).

---

## Next Work (M2 candidates)

These are the likely next steps once M1 is validated with real founder use:

1. **Client portal** — scoped view: project status, scope approval, shortlist review, proposal selection
2. **Consultant portal** — invitation inbox, proposal submission, engagement delivery
3. **Email notifications** — send on invitation, proposal selected, engagement started
4. **File upload** — deliverable submission with S3-compatible storage
5. **Payments** — Stripe integration for scope confirmation and closeout
6. **Vercel deployment** — production deploy with env vars wired
