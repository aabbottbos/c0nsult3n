# Consulten — Handoff Context

Current state of the build as of 2026-07-27. Last updated 2026-07-27 (Hardening sprint complete). Update this file when milestone status changes or decisions are reversed.

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
| M5 | ✅ Complete | Proposal deviation gate (PENDING_ADMIN_REVIEW), consultant selection → engagement auto-creation, sibling NOT_SELECTED, withdraw, admin deviation review UI, consultant deviation fields. 21/21 tests. |
| M6 | ✅ Complete | Delivery workflow, AI QA on deliverables, structured comms (CommunicationType enum), revision cycle, closeout, client+consultant feedback. 31/31 tests. |
| M7 | ✅ Complete | Dispute flow, payment status tracking, clientContactId FK fix. 40/40 tests. |
| Hardening Sprint | ✅ Complete | Permission invariant tests (3), admin work queue (/admin/queue), CI env vars + Node 22 upgrade |

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
- **M6: Engagement detail** — deliverable card with consultant notes, AI QA notes, risk flag badge (amber); "Mark Resolved" button for AdminTask when `aiQaRiskFlag === true`; revision request edit form (in-scope checkbox + due date); full comms thread with send form; "Close Engagement" button when `ACCEPTED`
- **M7: Engagement detail** — dispute panel (status badge, reason, AI summary snippet, link to `/admin/disputes/[id]`); "Open Dispute" inline form when no dispute exists and engagement is not terminal; payment panel (all fields displayed; paymentStatus/payoutStatus/adminNotes update form)
- **M7: Disputes list** at `/admin/disputes` — list of disputes with status badge and link; nav link in admin sidebar
- **M7: Dispute detail** at `/admin/disputes/[id]` — dispute reason, deliverable notes, comms thread, AI summary panel with "Summarize Dispute" trigger, resolve form (proposedResolution textarea + outcome select: Accept/Revision/Cancel)

### Client portal (`/projects`, `/projects/new`, `/projects/[id]`, `/projects/[id]/engagement/[engagementId]`)
- Sign up via `/sign-up` → role selector → webhook assigns role, creates org + contact
- Sidebar lists the client's projects with stage badges and action dots
- New project form → auto-submits on create
- Project detail is stage-aware: shows scope for review, shortlist with rationale + proposal select, engagement card, etc.
- **M6: Engagement detail** — deliverable with consultant notes + AI QA notes (auto-exposed); Accept button blocked with amber message when `aiQaRiskFlag === true`; revision form with textarea reason; feedback form when `CLOSED` (satisfaction 1–5, repeat intent, comments); typed comms panel
- **M7: Payment status card** — shows `amount` and `paymentStatus` only (no platformFee or payout fields)

### Consultant portal (`/invitations`, `/invitations/[id]`, `/engagements`, `/engagements/[id]`)
- Sign up via `/sign-up` → role selector → webhook assigns role, creates consultant profile
- Sidebar shows pending invitation badge count and links to Active Engagements
- Invitation inbox with urgency coloring (red < 5 days, amber < 10 days to expiry)
- Invitation detail shows full scope; proposal form visible only when status is `SENT/VIEWED/QUESTIONS_ASKED`
- **M6: Engagement detail** — submit form with file upload + consultant notes textarea (when `IN_PROGRESS`); AI QA status (running/complete with notes); resubmit form linked to open RevisionRequest (when `REVISION_REQUESTED`); feedback form when `CLOSED`; typed comms panel
- **M7: Payout status card** — shows `payoutAmount` (or "TBD" if null) and `payoutStatus` only (no amount or payment fields)

### Auth + routing
- `/sign-up` — two-step Clerk flow: credentials (email + password), then role selector (client / consultant). Uses Clerk v7 `SignUpFutureResource` API.
- `/api/webhooks/clerk` — handles `user.created`: reads `unsafeMetadata.role`, rejects anything other than `client` or `consultant` with HTTP 400, promotes to `publicMetadata`, then creates the appropriate DB records
- `proxy.ts` — public paths: `/sign-in`, `/sign-up`, `/api/webhooks`, `/api/clerk`. Role-based redirect at `/`: client → `/projects`, consultant → `/invitations`, admin → `/dashboard`

### Tests
- `tests/spine.test.ts` — M1 full happy-path spine (5 tests) + M2 permission invariants (4 tests): client org isolation, consultant invitation isolation, webhook role assignment for both roles. Extended in M6 to cover submitDeliverable (with notes), QA simulation, accept, close, and dual-party feedback.
- `tests/file-upload.test.ts` — file upload: mocks `@vercel/blob` `put()`, verifies `Deliverable.fileUrl` stored and engagement transitions to `DELIVERABLE_SUBMITTED`
- `tests/matching.test.ts` — M4 matching tests (4 tests: includes eligible, excludes restricted, excludes non-approved/non-published, aiFitTier stored on candidate) + M4 permission invariants (2 tests: createInvitation FK enforcement, client field projection)
- `tests/proposals.test.ts` — M5 proposal tests (5 tests: deviation gate, deviations approved → SUBMITTED → engagement created, no-deviation SUBMITTED, withdraw, sibling NOT_SELECTED + single engagement)
- `tests/deliverables.test.ts` — M6 (5 tests): submitDeliverable, runAiQa, AI QA risk flag → AdminTask → block → resolve → accept, no-flag accept, resubmitDeliverable
- `tests/closeout.test.ts` — M6 (3 tests): ACCEPTED→CLOSED dual feedback, duplicate upsert, invalid close throws
- `tests/communications.test.ts` — M6 (2 tests): sendMessage with CommunicationType, cross-engagement isolation
- `tests/disputes.test.ts` — M7 (5 tests): openDispute→DISPUTED+EventLog, resolveDispute ACCEPTED, resolveDispute CANCELLED, acceptEngagement blocked by open dispute, generateAiDisputeSummary writes AIOutputLog with exposed:false
- `tests/payments.test.ts` — M7 (4 tests): payment record auto-created with scope fee, updatePaymentStatus+EventLog, client field projection (no platformFee), consultant field projection (no amount/paymentStatus)
- `tests/permissions.test.ts` — Hardening (3 tests): scope ADMIN_REVIEW→CLIENT_CONFIRMED throws, engagement PENDING_START→ACCEPTED throws, proposal PENDING_ADMIN_REVIEW rejects selectProposal
- 43/43 tests pass against the real Neon dev DB
- Test setup uses atomic `TRUNCATE ... CASCADE` in both `beforeEach` and `afterEach` (replaces 21-step sequential `deleteMany` chain that was vulnerable to partial failures on Neon connection drops)

### M5: Proposal, selection, engagement
- Consultant proposal form: fit statement + optional deviation fields (fee/timing/deliverable). If deviations present, proposal enters `PENDING_ADMIN_REVIEW` instead of `SUBMITTED`.
- Admin proposal detail (`/proposals/[id]`): shows deviation fields with amber badge; "Approve Deviations" / "Reject" buttons when status is `PENDING_ADMIN_REVIEW`. Admin actions replaced — no "Select Proposal" button (selection is client-driven).
- Client shortlist: shows "Proposal in — under review" amber badge for `PENDING_ADMIN_REVIEW` proposals; blocks "Select this consultant" button until admin approves. Selecting a consultant auto-creates the engagement and marks all sibling proposals `NOT_SELECTED`.
- Consultant can withdraw a submitted proposal (before selection) from their invitation detail page.
- Spine test updated: `selectProposal` now auto-creates the engagement, so the spine test no longer calls `createEngagement` manually.
- 21/21 tests pass.

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
| Resend | `RESEND_API_KEY` in `.env.local` + Vercel env vars; FROM `Consulten <noreply@consulten.co>`; wrapper at `lib/email.ts` — 8 triggers: invitation sent, proposal selected, engagement started, deliverable submitted (consultant+admin), AI QA complete (client), revision requested (consultant), engagement closed (client+consultant) |
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
- **M6 schema additions:**
  - `CommunicationType` enum: `CLARIFICATION | DOCUMENT_REQUEST | REVISION_RESPONSE | ISSUE_FLAG`. `EngagementCommunication.messageType` is now this enum (was `String`).
  - `Deliverable` M6 fields: `consultantNotes String?`, `aiQaNotes String?`, `aiQaRiskFlag Boolean @default(false)`, `aiQaRunAt DateTime?`, `revisionRequestId String?` (FK to RevisionRequest, named relations `"ResubmitDeliverable"` and `"DeliverableRevisions"`).
  - `RevisionRequest` M6 fields: `inScopeConfirmation Boolean @default(true)`, `dueDate DateTime?`.
  - `Feedback` model: `engagementId`, `submittedBy` (userId), `role` (Role), `satisfaction Int`, `repeatIntent Boolean`, `comments String?`, `@@unique([engagementId, submittedBy])`.
  - `AdminTask` fleshed out: `engagementId String?`, `deliverableId String?`, `reason String`, `resolved Boolean @default(false)`, `@@index([engagementId])`, `@@index([deliverableId])`.
- **M6 services:**
  - `modules/deliverables/service.ts` — `submitDeliverable(engagementId, fileUrl, consultantNotes, actorId)`, `resubmitDeliverable(engagementId, revisionRequestId, fileUrl, consultantNotes, actorId)`, `runAiQa(deliverableId, actorId)` (calls Claude, writes QA fields, creates AdminTask on risk), `createFeedback(...)`.
  - `modules/engagements/service.ts` — `acceptEngagement` guards against unresolved AdminTask when `aiQaRiskFlag === true`; `closeEngagement` sends close emails to both parties; `resolveAdminTask` added.
  - `modules/communications/service.ts` — `messageType` is now `CommunicationType` (was `string`).
- **M7 schema additions:**
  - `Engagement.clientId String` → `Engagement.clientContactId String` + FK to `ClientContact`. `ClientContact` gains `engagements Engagement[]` back-relation.
  - `Dispute` model: full model replacing the stub — `engagementId @unique`, `openedBy` (userId), `disputeReason`, `issueSummary?`, `aiDisputeSummary?`, `adminReviewStatus DisputeStatus`, `proposedResolution?`, `finalResolution?`, `resultingStatus EngagementStatus?`, `closedAt?`, timestamps.
  - `DisputeStatus` enum: `OPENED | UNDER_ADMIN_REVIEW | PROPOSED_RESOLUTION | RESOLVED | CLOSED`.
  - `PaymentTransactionRecord` model: `engagementId @unique`, `amount Decimal(10,2)`, `platformFee?`, `payoutAmount?`, `paymentStatus PaymentStatus`, `payoutStatus PayoutStatus`, `paymentDueDate?`, `adminNotes?`, timestamps.
  - `PaymentStatus` enum: `NOT_REQUIRED_YET | AUTHORIZATION_PENDING | AUTHORIZED | PAYMENT_FAILED | PAYMENT_CONFIRMED | RELEASE_PENDING | RELEASED | REFUNDED | DISPUTED`.
  - `PayoutStatus` enum: `PENDING | RELEASE_PENDING | RELEASED | ON_HOLD | REFUNDED`.
  - `DISPUTED` engagement transitions added: `DISPUTED → ACCEPTED | REVISION_REQUESTED | CANCELLED`.
- **M7 services:**
  - `modules/disputes/service.ts` — `openDispute(engagementId, openedBy, disputeReason)` (creates Dispute, transitions engagement to DISPUTED, logs event); `generateAiDisputeSummary(disputeId, actorId)` (calls Claude, writes AIOutputLog with `exposed: false`, updates `aiDisputeSummary`); `resolveDispute(disputeId, proposedResolution, outcome, actorId)` (transitions engagement to ACCEPTED/REVISION_REQUESTED/CANCELLED, closes dispute); `listDisputes()`, `getDispute(id)`.
  - `modules/payments/service.ts` — `createPaymentRecord(engagementId, amount, actorId)` (auto-called by `createEngagement` after transaction, using scope fee); `updatePaymentStatus(engagementId, paymentStatus, payoutStatus, adminNotes, actorId)` (admin-only, logs event); `getPaymentRecord(engagementId)`.
  - `modules/engagements/service.ts` — `acceptEngagement` gains second guard: rejects if open `Dispute` exists (status OPENED/UNDER_ADMIN_REVIEW/PROPOSED_RESOLUTION); `createEngagement` signature changed `clientId` → `clientContactId`.
  - `modules/proposals/service.ts` — `selectProposal` looks up `ClientContact` by `userId` to pass `clientContactId` to `createEngagement`; falls back to org's first contact for admin actor in tests.

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

## Known Gaps / Intentional Deferrals (M7)

- "Revision Due Soon" cron — requires cron infrastructure, deferred post-M7.
- Hardening sprint (permission test sweep, admin queue surfaces, EventLog audit coverage) — deferred post-M7.
- Client-facing dispute UI — clients see engagement status change only; admin owns dispute workflow.
- `ConsultantPayoutSetup` expansion — deferred.
- No duplicate-proposal guard (consultant can submit multiple proposals if invitation resets).
- Withdrawn proposals don't update invitation status back.
- `listProposals` admin page doesn't filter by status — all proposals shown including NOT_SELECTED/WITHDRAWN.
- AI QA is fire-and-forget — if Claude is unavailable, engagement stays in `DELIVERABLE_SUBMITTED` indefinitely (no retry or timeout).
- **Vercel deployment** (ongoing blocker) — Git integration rejects pushes due to email mismatch between Vercel team member and GitHub account `aabbottbos`. CLI deploys fail with DNS errors.

---

## Hardening Sprint (in progress)

Plans in `docs/superpowers/plans/` (all dated 2026-07-26):

| Plan | File | Status |
|------|------|--------|
| MVP A Hardening | `2026-07-26-mvpa-hardening.md` | 🔄 In progress — permission tests done, queue page + CI pending |
| Consultant Verification & Payout | `2026-07-26-consultant-verification-payout.md` | ✅ Complete |
| Notifications | `2026-07-26-notifications.md` | ✅ Complete |
| Scoping Matrix Integration | `2026-07-26-scoping-matrix.md` | ⏳ Not started |

### MVP A Hardening — complete
- **Permission invariant tests** — 3 tests in `tests/permissions.test.ts` covering raw status bypass rejection
- **Admin work queue** (`/admin/queue`) — unified pending-items page across all modules; nav link at top of admin sidebar
- **CI env vars** — added `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN`; upgraded Node 20→22

### Also produced this session
- `docs/DEPLOYMENT.md` — full local + Vercel deployment guide (prerequisites, env vars, Clerk setup, ngrok, migrations, admin user creation, common issues table)

---

## Next Work (M8 — TBD)

After hardening sprint completes:
- Vercel deployment fix (ongoing blocker — email mismatch between Vercel team and GitHub account)
- Stripe/payment provider integration (MVP B milestone)
- Cron: "Revision Due Soon" notifications
