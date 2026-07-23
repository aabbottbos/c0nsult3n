# Consulten — Handoff Context

Current state of the build as of 2026-07-23. Update this file when milestone status changes or decisions are reversed.

---

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 Backend (Plan A) | ✅ Complete | All 15 tasks: schema, services, state machines, auth, CI, seed, tests |
| M1 Admin UI (Plan B) | ✅ Complete | All 11 tasks: 10 module CRUD pages + dashboard, pushed to GitHub |
| M1 SPEC Gaps | ✅ Complete | RevisionRequest + EngagementCommunication entities, restrictions service, skill docs, decision log, scoping matrix, security-reviewer subagent |
| M2+ | Not started | |

M1 is the full spine: a founder can drive a project from creation through engagement closeout using the admin UI. No client or consultant UI exists yet.

---

## What's Working

- **Admin UI** — live and verified. Login with a Clerk account that has `role: admin` in `publicMetadata`
- **URL structure** — no `/admin/` prefix. Routes are `/dashboard`, `/projects`, `/clients`, etc. (the `(admin)` directory is a Next.js route group, not a path segment)
- **Dashboard** shows live entity counts with links to each module
- **All module list + detail pages** with state-machine-driven action buttons
- **Server Actions** — clicking an action button calls the service, transitions state, logs an event, redirects
- **Event log** — every state transition is recorded in `eventLog`; visible on each detail page and at `/events`
- **Integration tests** — 2 test files, 5 tests, all pass against the real Neon dev DB
- **CI** — GitHub Actions runs lint → typecheck → test → build on every push
- **Dev server script** — `./server.sh start|stop|restart|status|logs`

---

## Infrastructure

| Resource | Details |
|----------|---------|
| GitHub repo | `https://github.com/aabbottbos/c0nsult3n` (personal account `aabbottbos`) |
| Neon project | ID `blue-cherry-03073401`, region `us-west-2` |
| Neon DB | `neondb` on branch `main` |
| Vercel | Not yet deployed |
| Clerk | Dev instance `cheerful-lark-30`; app ID `app_3GsuSFLVS2W9tnmFIaS797VVPyK`; webhook route at `/api/webhooks/clerk` |
| Sentry | Configured in `sentry.*.config.ts`; DSN in `.env.local` |

**Database connection string** (pooled, for app + tests):
```
postgresql://neondb_owner:npg_sPwSOVEzG6W2@ep-quiet-night-afjrij5d-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```
This goes in both `.env` (for Vitest/seed) and `.env.local` (for Next.js dev).

---

## Clerk Setup Notes

Roles are set via `publicMetadata.role` in the Clerk Dashboard. The proxy at `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) protects all non-public routes. Role-checking uses `requireRole(role)` from `lib/auth.ts`, which reads `sessionClaims.metadata.role`.

**Required Clerk Dashboard config:**
- Session token customization must include `"metadata": "{{user.public_metadata}}"` — without this, `sessionClaims.metadata` is absent and all role checks fail with 404.

To create an admin user:
1. Sign up at the dev Clerk instance (`/sign-in`)
2. Clerk Dashboard → Users → select user → Metadata → set `publicMetadata`: `{"role": "admin"}`
3. Sign out and sign back in (session tokens are minted at sign-in; existing sessions don't pick up metadata changes)

---

## Known Gaps / Intentional Deferrals

These are real, not forgotten — they're MVP B or below the M1 bar:

- **No client or consultant UI.** The `(client)` and `(consultant)` route group directories exist but have no pages.
- **`listScopes`, `listShortlists`, `listDeliverables` not in service layer.** The admin list pages for these three modules query `db` directly. Acceptable for now; add service functions before any non-admin code needs them.
- **No AI features.** `AIOutputLog` is in the schema but nothing writes to it yet. No AI features in M1.
- **No email sending.** `sendInvitation` transitions state but does not actually email the consultant.
- **No file uploads.** `deliverable.fileUrl` is nullable and unused; upload flow is MVP B.
- **No payments.** The full Stripe integration is MVP B.
- **Debug page exists at `/debug`.** Returns raw session claims. Remove before any real user exposure.
- **Seed data may be present in the DB.** Running `npx prisma db seed` adds test data. The integration test `afterEach` cleans up its own records but doesn't touch manually seeded rows. Run a manual `TRUNCATE` via Neon MCP if the DB gets dirty before testing.

---

## Schema Additions (post-M1)

Two new models added after M1 completion (both migrated to live Neon DB):

- **`RevisionRequest`** — links engagement + deliverable, status `OPEN/ADDRESSED/WITHDRAWN`. Service functions in `modules/deliverables/service.ts`: `createRevisionRequest`, `addressRevisionRequest`, `withdrawRevisionRequest`, `listRevisionRequests`.
- **`EngagementCommunication`** — immutable typed messages on engagements, indexed on `engagementId`. Service in `modules/communications/service.ts`: `sendMessage`, `listMessages`.
- **`modules/restrictions/service.ts`** — `isEligible(consultantId)` enforces the SPEC §6.3 invariant that active restrictions exclude a consultant from matching.

---

## Knowledge Documents

All in `.claude/skills/`:

| File | Contents |
|------|----------|
| `entity-dictionary.md` | All 21 models with fields, relations, notes |
| `state-machine.md` | All transition maps as FROM → TO (action) |
| `permissions.md` | Permission invariants from SPEC §6.3 and what enforces each |
| `ai-gates.md` | AI approval gate table, AIOutputLog fields, M1 stub status |
| `scoping-matrix/SKILL.md` | 8 seed rows across 7 specializations |

Decision log: `decision-log.md` (20 architectural decisions, append-only).

Security reviewer subagent: `.claude/agents/security-reviewer.md`.

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
7. **Remove `/debug` page** — before any real user exposure
