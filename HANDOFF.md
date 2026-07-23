# Consulten — Handoff Context

Current state of the build as of 2026-07-23. Last updated 2026-07-23. Update this file when milestone status changes or decisions are reversed.

---

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 Backend (Plan A) | ✅ Complete | All 15 tasks: schema, services, state machines, auth, CI, seed, tests |
| M1 Admin UI (Plan B) | ✅ Complete | All 11 tasks: 10 module CRUD pages + dashboard, pushed to GitHub |
| M1 SPEC Gaps | ✅ Complete | RevisionRequest + EngagementCommunication entities, restrictions service, skill docs, decision log, scoping matrix, security-reviewer subagent |
| M2 Portals + AI | ✅ Complete | 14 tasks: sign-up flow, webhooks, client portal, consultant portal, AI scope drafting, AI match rationale, tests |
| M3 | In progress | Focus: email notifications. Vercel deploy blocked (Git integration auth issue). |

---

## What's Working

### Admin portal (`/dashboard`, `/projects`, `/clients`, etc.)
- Full CRUD + state-machine action buttons for all 10 modules
- Dashboard with live entity counts
- AI scope drafting: "Draft Scope with AI" button on project detail (status `UNDER_ADMIN_REVIEW`) calls Claude, creates a Scope record, logs to `AIOutputLog`
- AI match rationale: "Generate Match Rationale" button on shortlist detail calls Claude per-candidate, stores on `ShortlistCandidate.rationale`, logs to `AIOutputLog`
- Event log at `/events` and on each detail page

### Client portal (`/projects`, `/projects/new`, `/projects/[id]`, `/projects/[id]/engagement/[engagementId]`)
- Sign up via `/sign-up` → role selector → webhook assigns role, creates org + contact
- Sidebar lists the client's projects with stage badges and action dots
- New project form → auto-submits on create
- Project detail is stage-aware: shows scope for review, shortlist with rationale + proposal select, engagement card, etc.
- Engagement detail shows scope summary, deliverable with Accept/Request Revision buttons when status is `UNDER_REVIEW`

### Consultant portal (`/invitations`, `/invitations/[id]`, `/engagements`, `/engagements/[id]`)
- Sign up via `/sign-up` → role selector → webhook assigns role, creates consultant profile
- Sidebar shows pending invitation badge count and links to Active Engagements
- Invitation inbox with urgency coloring (red < 5 days, amber < 10 days to expiry)
- Invitation detail shows full scope; proposal form visible only when status is `SENT/VIEWED/QUESTIONS_ASKED`
- Engagement detail shows scope reminder, deliverable submit form (URL input, only when `IN_PROGRESS`), submitted deliverables list

### Auth + routing
- `/sign-up` — two-step Clerk flow: credentials (email + password), then role selector (client / consultant). Uses Clerk v7 `SignUpFutureResource` API.
- `/api/webhooks/clerk` — handles `user.created`: reads `unsafeMetadata.role`, rejects anything other than `client` or `consultant` with HTTP 400, promotes to `publicMetadata`, then creates the appropriate DB records
- `proxy.ts` — public paths: `/sign-in`, `/sign-up`, `/api/webhooks`, `/api/clerk`. Role-based redirect at `/`: client → `/projects`, consultant → `/invitations`, admin → `/dashboard`

### Tests
- `tests/spine.test.ts` — M1 full happy-path spine (5 tests) + M2 permission invariants (4 tests): client org isolation, consultant invitation isolation, webhook role assignment for both roles
- 9/9 tests pass against the real Neon dev DB

---

## Infrastructure

| Resource | Details |
|----------|---------|
| GitHub repo | `https://github.com/aabbottbos/c0nsult3n` (personal account `aabbottbos`) |
| Neon project | ID `blue-cherry-03073401`, region `us-west-2` |
| Neon DB | `neondb` on branch `main` |
| Vercel | Project `c0nsult3n` under team `c0nsult3n`. Deployments failing — Git integration rejects pushes (author email `aabbottbos` GitHub account not matching Vercel team member). CLI deploys fail with DNS errors. Needs investigation. |
| Clerk | Dev instance `cheerful-lark-30`; app ID `app_3GsuSFLVS2W9tnmFIaS797VVPyK`; webhook route at `/api/webhooks/clerk` |
| Sentry | Configured in `sentry.*.config.ts`; DSN in `.env.local` |
| Anthropic | `ANTHROPIC_API_KEY` in `.env.local`; model `claude-sonnet-4-6`; wrapper at `lib/ai.ts` |

**Database connection string** (pooled, for app + tests):
```
postgresql://neondb_owner:npg_sPwSOVEzG6W2@ep-quiet-night-afjrij5d-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```
This goes in both `.env` (for Vitest/seed) and `.env.local` (for Next.js dev).

**Build fixes applied (M3, 2026-07-23):**
- `prisma generate` added to build script; `app/generated/prisma/` added to `.gitignore`
- `prisma` and `dotenv` moved to `dependencies` (required at Vercel build time)
- Webpack + Turbopack alias added in `next.config.ts`: `@/app/generated/prisma` → `app/generated/prisma/client.ts` (Prisma 7 no longer generates `index.ts`)
- Vitest alias in `vitest.config.ts` unchanged (already correct)
- Duplicate Next.js routes resolved: `(admin)/engagements`, `(admin)/invitations`, `(admin)/projects` moved to `(admin)/admin/*` (URLs: `/admin/engagements`, `/admin/invitations`, `/admin/projects`)
- Client engagement detail moved from `(client)/engagements/[id]` to `(client)/projects/[id]/engagement/[engagementId]`
- Sign-out button added to all three portal sidebars (`components/sign-out-button.tsx`)

---

## Clerk Setup Notes

Roles are set via `publicMetadata.role`. The proxy at `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts`) protects all non-public routes. Role-checking uses `requireRole(role)` from `lib/auth.ts`, which reads `sessionClaims.metadata.role`.

**Required Clerk Dashboard config:**
- Session token customization must include `"metadata": "{{user.public_metadata}}"` — without this, `sessionClaims.metadata` is absent and all role checks fail with 404.

**To create an admin user** (admin accounts cannot self-register — role must be set manually):
1. Sign up at `/sign-up` (or use Clerk Dashboard → Create user)
2. Clerk Dashboard → Users → select user → Metadata → set `publicMetadata`: `{"role": "admin"}`
3. Sign out and sign back in

**To create a client or consultant user:**
- Use the self-service sign-up at `/sign-up` — role is set during registration

**Webhook must be active** for self-service sign-up to work. The webhook creates org+contact (clients) or profile (consultants). If the webhook isn't configured in the Clerk Dashboard pointing at your dev URL + `/api/webhooks/clerk`, DB records won't be created and the portal pages will error.

---

## Known Gaps / Intentional Deferrals

- **No email sending.** `sendInvitation` transitions state but does not actually email the consultant. Invitations are only visible via the admin UI or the consultant portal if they already know to check.
- **No file uploads.** `deliverable.fileUrl` is a text field — consultants paste a URL (Google Drive, Dropbox, etc.). Real upload flow is MVP B.
- **No payments.** The full Stripe integration is MVP B.
- **Debug page exists at `/debug`.** Returns raw session claims. Remove before any real user exposure.
- **AI output is not gated.** `draftScopeWithAIAction` and `generateMatchRationaleAction` write to `AIOutputLog` but the output is shown directly without a separate human-review step in the UI. The service layer logs it; the approval step is implicit (admin reviews and edits before publishing). Per `ai-gates.md`, explicit gate UI is MVP B.
- **Webhook requires public URL.** In local dev, the Clerk webhook can't reach `localhost`. Use `ngrok` or deploy to Vercel to test the real sign-up flow end-to-end.
- **`listScopes`, `listShortlists`, `listDeliverables` not in service layer.** Admin list pages query `db` directly. Fine for now.
- **Seed data may be present in the DB.** Integration test `afterEach` cleans its own records but not manually seeded rows.

---

## Schema Additions (post-M1)

- **`RevisionRequest`** — links engagement + deliverable, status `OPEN/ADDRESSED/WITHDRAWN`. Service in `modules/deliverables/service.ts`.
- **`EngagementCommunication`** — immutable typed messages on engagements. Service in `modules/communications/service.ts`.
- **`ShortlistCandidate.rationale String?`** — AI-generated match rationale, populated by `generateMatchRationaleAction`, displayed in client shortlist view.
- **`AIOutputLog`** — logs every Claude call: model, prompt, output, action type, entity reference. Written by both AI admin actions.
- **`modules/restrictions/service.ts`** — `isEligible(consultantId)` enforces SPEC §6.3.

---

## Knowledge Documents

All in `.claude/skills/`:

| File | Contents |
|------|----------|
| `entity-dictionary.md` | All models with fields, relations, notes |
| `state-machine.md` | All transition maps as FROM → TO (action) |
| `permissions.md` | Permission invariants from SPEC §6.3 and what enforces each |
| `ai-gates.md` | AI approval gate table, AIOutputLog fields |
| `scoping-matrix/SKILL.md` | 8 seed rows across 7 specializations |

Decision log: `decision-log.md` (append-only).
Security reviewer subagent: `.claude/agents/security-reviewer.md`.

---

## Push Procedure

This `build/` directory is a subdirectory of a larger parent git repo. Standard `git push` won't work from here. Always push via:

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```

The `consulten` remote points to `https://github.com/aabbottbos/c0nsult3n.git`.

---

## Next Work (M3)

M3 is in progress. Focus is email notifications first.

1. **Email notifications** (in progress) — send on: invitation sent, proposal selected, engagement started, deliverable submitted. Provider TBD (Resend recommended).
2. **Vercel deployment** — blocked on Git integration auth. Workaround: investigate connecting GitHub account `aabbottbos` to Vercel team member email, or switch to manual CLI deploy once DNS issue resolved.
3. **Remove `/debug` page** — before any real user exposure.
4. **File upload** — replace URL text field with real upload (Vercel Blob); deliverable submission UX.
5. **Payments** — Stripe for scope confirmation deposit and closeout payment (MVP B unless pilot needs it).
6. **Explicit AI gate UI** — admin approval step before AI-drafted scope or rationale is shown to users (MVP B).
