# Consulten — Handoff Context

Current state of the build as of 2026-07-23. Last updated 2026-07-23 (M4 complete). Update this file when milestone status changes or decisions are reversed.

---

## Milestone Status

| Milestone | Status | Notes |
|-----------|--------|-------|
| M1 Backend (Plan A) | ✅ Complete | All 15 tasks: schema, services, state machines, auth, CI, seed, tests |
| M1 Admin UI (Plan B) | ✅ Complete | All 11 tasks: 10 module CRUD pages + dashboard, pushed to GitHub |
| M1 SPEC Gaps | ✅ Complete | RevisionRequest + EngagementCommunication entities, restrictions service, skill docs, decision log, scoping matrix, security-reviewer subagent |
| M2 Portals + AI | ✅ Complete | 14 tasks: sign-up flow, webhooks, client portal, consultant portal, AI scope drafting, AI match rationale, tests |
| M3 | ✅ Complete | Email notifications (Resend), file uploads (Vercel Blob), removed /debug page, tsconfig path fix, test teardown fix. Vercel deploy still blocked (separate). |
| M4 | ✅ Complete | Matching pipeline (eligibility filter + AI assessment), admin matching workspace, addCandidateWithAI service function, invitation dispatch from shortlist detail. 16/16 tests. |

---

## What's Working

### Admin portal (`/dashboard`, `/projects`, `/clients`, etc.)
- Full CRUD + state-machine action buttons for all 10 modules
- Dashboard with live entity counts
- AI scope drafting: "Draft Scope with AI" button on project detail (status `UNDER_ADMIN_REVIEW`) calls Claude, creates a Scope record, logs to `AIOutputLog`
- AI match rationale: "Generate Match Rationale" button on shortlist detail calls Claude per-candidate, stores on `ShortlistCandidate.rationale`, logs to `AIOutputLog`
- Event log at `/events` and on each detail page
- **M4: Admin matching workspace** at `/admin/projects/[id]/matching` — "Run Matching" button runs eligibility filter + AI assessment, shows eligible consultants with AI tier badges, per-consultant "Add to Shortlist" button
- **M4: Invitation dispatch** — "Invite" button on shortlist detail (status `ADMIN_REVIEW`/`CLIENT_VISIBLE`/`UPDATED`) creates and sends invitation with 14-day deadline

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
- Engagement detail shows scope reminder, file upload form (only when `IN_PROGRESS`), submitted deliverables list with Blob URL links

### Auth + routing
- `/sign-up` — two-step Clerk flow: credentials (email + password), then role selector (client / consultant). Uses Clerk v7 `SignUpFutureResource` API.
- `/api/webhooks/clerk` — handles `user.created`: reads `unsafeMetadata.role`, rejects anything other than `client` or `consultant` with HTTP 400, promotes to `publicMetadata`, then creates the appropriate DB records
- `proxy.ts` — public paths: `/sign-in`, `/sign-up`, `/api/webhooks`, `/api/clerk`. Role-based redirect at `/`: client → `/projects`, consultant → `/invitations`, admin → `/dashboard`

### Tests
- `tests/spine.test.ts` — M1 full happy-path spine (5 tests) + M2 permission invariants (4 tests): client org isolation, consultant invitation isolation, webhook role assignment for both roles
- `tests/file-upload.test.ts` — file upload: mocks `@vercel/blob` `put()`, verifies `Deliverable.fileUrl` stored and engagement transitions to `DELIVERABLE_SUBMITTED`
- `tests/matching.test.ts` — M4 matching tests (4 tests: includes eligible, excludes restricted, excludes non-approved/non-published, aiFitTier stored on candidate) + M4 permission invariants (2 tests: createInvitation FK enforcement, client field projection)
- 16/16 tests pass against the real Neon dev DB

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
| Resend | `RESEND_API_KEY` in `.env.local` + Vercel env vars; FROM `Consulten <noreply@consulten.co>`; wrapper at `lib/email.ts` — 4 triggers: invitation sent, proposal selected, engagement started, deliverable submitted |
| Vercel Blob | `BLOB_READ_WRITE_TOKEN` in `.env.local` + Vercel env vars; public access; blob keys prefixed `{engagementId}/{filename}`; 10mb body limit in `next.config.ts` |

**Database connection string** (pooled, for app + tests):
```
postgresql://neondb_owner:npg_sPwSOVEzG6W2@ep-quiet-night-afjrij5d-pooler.c-2.us-west-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require
```
This goes in both `.env` (for Vitest/seed) and `.env.local` (for Next.js dev).

**Build fixes applied (M3, 2026-07-23):**
- `prisma generate` added to build script; `app/generated/prisma/` added to `.gitignore`
- `prisma` and `dotenv` moved to `dependencies` (required at Vercel build time)
- Webpack + Turbopack alias added in `next.config.ts`: `@/app/generated/prisma` → `app/generated/prisma/client.ts` (Prisma 7 no longer generates `index.ts`)
- `tsconfig.json` updated with explicit `@/app/generated/prisma` path so `tsc --noEmit` resolves it correctly
- Vitest alias in `vitest.config.ts` unchanged (already correct)
- Duplicate Next.js routes resolved: `(admin)/engagements`, `(admin)/invitations`, `(admin)/projects` moved to `(admin)/admin/*` (URLs: `/admin/engagements`, `/admin/invitations`, `/admin/projects`)
- Client engagement detail moved from `(client)/engagements/[id]` to `(client)/projects/[id]/engagement/[engagementId]`; fixed broken relative import (`../../../../actions` → `../../../actions`)
- Sign-out button added to all three portal sidebars (`components/sign-out-button.tsx`)
- `tests/setup.ts` teardown order fixed: added `revisionRequest` and `engagementCommunication` deletes in correct FK order

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

- **Vercel deployment blocked.** Git integration rejects pushes — Vercel team member email doesn't match GitHub account `aabbottbos`. CLI deploys also fail with DNS errors. Workaround: investigate connecting GitHub account to Vercel team, or use a deploy hook instead of Git integration. This is the top M4 blocker.
- **No payments.** The full Stripe integration is MVP B.
- **AI output is not gated.** `draftScopeWithAIAction` and `generateMatchRationaleAction` write to `AIOutputLog` but the output is shown directly without a separate human-review step in the UI. The service layer logs it; the approval step is implicit (admin reviews and edits before publishing). Per `ai-gates.md`, explicit gate UI is MVP B.
- **Webhook requires public URL.** In local dev, the Clerk webhook can't reach `localhost`. Use `ngrok` or deploy to Vercel to test the real sign-up flow end-to-end.
- **`listScopes`, `listShortlists`, `listDeliverables` not in service layer.** Admin list pages query `db` directly. Fine for now.
- **Seed data may be present in the DB.** Integration test `afterEach` cleans its own records but not manually seeded rows.
- **Deliverable link text is the raw Blob URL.** The submitted deliverables list renders the full `blob.vercel-storage.com/...` URL as link text. Could show filename instead — cosmetic, not blocking.

---

## Schema Additions (post-M1)

- **`RevisionRequest`** — links engagement + deliverable, status `OPEN/ADDRESSED/WITHDRAWN`. Service in `modules/deliverables/service.ts`.
- **`EngagementCommunication`** — immutable typed messages on engagements. Service in `modules/communications/service.ts`.
- **`ShortlistCandidate.rationale String?`** — AI-generated match rationale, populated by `generateMatchRationaleAction`, displayed in client shortlist view.
- **`ShortlistCandidate` M4 fields (all nullable)** — `filterReason`, `baselineScore`, `aiFitTier`, `aiFitScore`, `aiFitRationale`, `aiRiskFlags`, `adminApprovalStatus`, `clientVisibleStatus`. Populated by `runMatching` (aiFitTier/aiFitRationale) and `addCandidateWithAI`. Internal fields — never exposed to client.
- **`modules/matching/service.ts`** — `runMatching(projectId, actorId)`: eligibility filter (approved/active/published + restrictions check) + AI fit assessment. Creates Shortlist if absent. Writes AIOutputLog. Returns `{ shortlistId, eligible, aiAssessments }`.
- **`modules/shortlists/service.ts` — `addCandidateWithAI`** — idempotent addCandidate that also stores `aiFitTier` and `aiFitRationale`. Has `findFirst` guard to prevent duplicates.
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

## Next Work (M5)

M4 is complete. M5 spec is in `SPEC - Complete MVP A.md §3`.

1. **Vercel deployment** (top blocker) — Git integration rejects pushes due to email mismatch between GitHub account `aabbottbos` and Vercel team. Options: (a) add `aabbottbos` GitHub account as a Vercel team member, (b) reconfigure Git integration to use the correct GitHub account, (c) use a Vercel deploy hook triggered from GitHub Actions instead. Once unblocked, add all env vars to Vercel production.
2. **M5: Proposal, selection, engagement** — Consultant submits proposal/fit response; admin reviews deviations; client selects consultant; engagement created. Key entities: `Proposal` (structured deviations), `Engagement` (approved scope version). Key rule: proposals with deviations need admin review before client can accept.
3. **M4 known gaps to address** — (a) Duplicate-invitation guard: no server-side check if consultant already has active invitation; (b) Invite button on shortlist page doesn't show "Invited" status; (c) `generateMatchRationaleAction` in `shortlists/actions.ts` writes DB directly (pre-existing, not M4 regression).
4. **Explicit AI gate UI** (MVP B) — admin approval step before AI output shown to users. Defer unless pilot requires it.
5. **Payments** (MVP B) — Stripe integration. Defer.
