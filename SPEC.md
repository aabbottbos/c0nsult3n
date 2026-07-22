# Consulten MVP A — Foundation Specification (M0)

Status: **DRAFT — under review for Gate 0**
Owner: `<founder>` · Reviewer: `<fractional senior engineer>` · Last updated: `<date>`

---

## 1. How to use this spec

This is the **foundation spec** produced in Milestone 0. It is the source of truth
for the decisions, module structure, and cross-cutting models (entities, states,
permissions, AI approval gates) that every later milestone builds on. Code follows
this spec; when the spec and the code disagree, fix the spec first, then the code.

Detailed, sometimes-relevant domain knowledge does **not** live here — it lives in
`.claude/skills/` (see §8) so it doesn't bloat every session. This spec references
those skills; it does not reproduce them.

Full field dictionaries, the complete permission matrix, exhaustive state
transitions, screen-by-screen surfaces, and per-feature test plans are authored
into skills and per-milestone specs — not here. This document carries only what M1
(the walking skeleton) needs plus the decisions that unblock the whole build.

**Definition of done for M0:** everything in §10 is checked and signed off at Gate 0.

---

## 2. What MVP A is validating

MVP A exists to validate assumptions, not to demonstrate screens. The build
sequence and every gate are tied to these:

- Buyers will submit structured project requests (intake feasibility).
- Requests can be classified via a **Scoping Matrix** and turned into clear scopes
  with AI + admin review.
- Qualified consultants will onboard, disclose availability/restrictions, and respond.
- Matching produces shortlists buyers **trust** (highest-risk assumption).
- Buyers will select from a curated shortlist with low friction.
- ≤10-hour fixed-scope work can be delivered and closed out reliably.
- AI-assisted QA meaningfully helps closeout.
- The workflow is operationally repeatable under admin supervision.

Staging principle: MVP A → MVP B → True Platform are separated by **business
assumptions and operational risk**, not by tooling. Do not pull MVP B features
forward (see §9).

---

## 3. Locked product constraints

These are decided and not up for debate in MVP A:

- Engagements are bounded (~10-hour cap), fixed-scope, fixed-fee or fee-capped.
- Every engagement ties to one **admin-approved scope** (deliverable, acceptance
  criteria, assumptions, exclusions, required inputs, due date, fee, effort cap).
- Matching is **admin-curated**: system/AI filter, score, and explain; an admin
  approves the final shortlist before any client visibility.
- Only admins invite consultants, and only shortlisted consultants can be invited.
- Communication is **structured** (typed, workflow-tied messages), not open chat.
- AI **drafts, classifies, scores, checks, summarizes, and recommends**. It does
  not make final high-risk decisions in MVP A. Human approval gates §7 are enforced.
- Architecture is a **modular monolith** on **one relational DB** (§5).

---

## 4. Open decisions to confirm at Gate 0

Proposed defaults below. The founder + fractional engineer confirm or change each,
then record the decision in the decision log and fill in `CLAUDE.md §Stack`.

| Decision | Proposed default | Rationale / note |
| --- | --- | --- |
| Web framework | A single full-stack app in one language | One deployable fits a modular monolith and a founder-led build. Two viable directions: a TypeScript full-stack app (e.g. Next.js) or a batteries-included server framework (e.g. Rails/Django) that gives admin scaffolding + auth cheaply — the admin surface is heavy here, so weigh that. |
| Relational DB | PostgreSQL | Strong indexing for matching filters; JSON columns for "structured scope fields + text"; mature. |
| Auth | Managed auth provider or framework-native | Must support login + password reset / passwordless recovery and role-based access. Do not hand-roll. |
| Transactional email | Managed provider (Postmark / Resend / SendGrid) | Delivery is truth-only; product owns workflow state. |
| File storage | S3-compatible object storage | Deliverables, inputs, verification artifacts. Artifacts are access-restricted. |
| AI provider | Anthropic API | All AI outputs are logged and gated per §7. Provider is swappable behind an `ai` service module. |
| Payments | Stripe | Source of truth for payment events. MVP A may use basic status tracking / admin-mediated confirmation; defer deep Connect/payout flow unless the pilot needs it. |
| Error monitoring | Sentry | Wire in from M0. |
| Environments | Separate dev / test / prod | Required before any real user exposure. |

Also confirm at Gate 0: hosting provider, CI provider, and the security posture for
PII and verification artifacts (encryption at rest, access restriction, retention).

---

## 5. Module map (modular monolith)

One app, one DB, organized by business-domain module. Each module owns its tables
and exposes a service layer; cross-module calls go through service layers only.

- `auth-users` — users, roles, sessions, account/contact change requests
- `clients` — client organizations, client contacts/profiles
- `consultants` — consultant profiles, availability, verification, payout setup
- `restrictions` — consultant visibility/work restrictions
- `skills` — skill taxonomy and tags
- `projects` — intake / original expressed need
- `scoping-matrix` — classification of a project to scope category/type
- `scopes` — approved work definition
- `matching` — eligibility filter + baseline scoring + candidate lists
- `shortlists` — shortlist and shortlist candidates
- `invitations` — admin-only invitations to shortlisted consultants
- `proposals` — consultant proposal / fit response + deviations
- `engagements` — active/completed work + engagement workspace
- `communications` — structured, typed, workflow-tied messages
- `deliverables` — submissions, AI QA notes, buyer review status
- `closeout-qa` — QA/closeout flow, revision requests
- `disputes` — issue escalation and admin resolution
- `payments` — payment/payout status + financial records (provider = truth)
- `notifications` — events → notifications
- `ai` — AI service calls, prompt versions, output logs (swappable provider)
- `admin` — admin dashboards, queues, overrides, act-on-behalf (audited)
- `audit-events` — event/activity log across the system

If later justified, `matching`, `ai`, `payments`, `notifications`, or `analytics`
can be split into services — not in MVP A.

---

## 6. Cross-cutting foundations for M1 (walking skeleton)

M1 builds the thinnest end-to-end happy path with founders simulating all roles
and AI stubbed/manual. To do that, M0 must define the following at foundation
level. Full field-by-field detail is authored into the `entity-dictionary` skill.

### 6.1 Core entities (spine subset)

The minimum entities to move a project from intake to closeout:

`User` · `Role` · `ClientOrganization` · `ClientContact` · `ConsultantProfile` ·
`ConsultantRestriction` · `Skill` · `Project` · `ScopingMatrixClassification` ·
`Scope` · `Shortlist` · `ShortlistCandidate` · `ConsultantInvitation` ·
`Proposal` · `Engagement` · `EngagementCommunication` · `Deliverable` ·
`RevisionRequest` · `Dispute` · `Notification` · `AdminTask` ·
`LegalAcceptanceRecord` · `ConsultantVerification` · `ConsultantPayoutSetup` ·
`PaymentTransactionRecord` · `AIOutputLog` · `EventLog`

For M1, most entities need only their key identity fields, status field, and
relationships. Rich field sets are filled in per milestone.

Three consultant statuses are **separate** and must not be collapsed:
approval status (Consulten approved participation), account status (active /
suspended / deactivated), and profile publication status (shown for matching or not).

### 6.2 State machines (the ones M1 exercises)

Defined in full in the `state-machine` skill. The spine M1 must implement:

- **Project:** Draft → Submitted → Under Admin Review → Scope Approved → Ready for
  Matching → Matching in Progress → Shortlist Ready → Engagement Created → Closed
  (plus Cancelled, Needs Clarification).
- **Scope:** Not Started → AI Drafted → Admin Review → Admin Approved →
  Client Confirmed (plus Client Change Requested, Rejected).
- **Shortlist:** Draft → Admin Review → Client Visible → Updated → Closed.
- **Invitation:** Draft → Sent → (Viewed / Accepted Interest / Declined /
  Questions Asked / Proposal Submitted) → Expired / Withdrawn.
- **Engagement:** Pending Start → In Progress → Deliverable Submitted →
  Under Review → (Revision Requested / Disputed) → Accepted / Closed (or Cancelled).

Rule: users take actions; the system records the transition. Reject any attempt to
set a raw status directly.

### 6.3 Permission foundations

Full matrix is authored into the `permissions` skill. The invariants M1 must
enforce from day one (these are also in `CLAUDE.md`):

- Users see only records they're authorized to see; admin-only fields never reach
  clients or consultants.
- Clients see the admin-approved shortlist and approved rationale only — never
  internal scores, admin notes, or unapproved AI rationale.
- A consultant must be on the shortlist before it can be invited.
- Consultants see only invited or assigned projects; never competing proposals.
- Active restrictions exclude or flag a consultant during matching.
- Standard users cannot edit raw statuses; admin overrides are logged.

### 6.4 AI touchpoints and approval gates

Full table in the `ai-gates` skill. Foundation rule for M1: any AI output listed
below as gated must pass admin approval before user exposure.

| AI touchpoint | Human approval before user exposure? |
| --- | --- |
| Profile prep, intake clarification, wording help, non-decisional summaries, proposal drafting | No (directly user-facing) |
| Scoping Matrix mapping, scope draft (final scope) | Yes |
| Client-facing match rationale, trust-affecting risk flags | Yes |
| Deliverable QA notes | Conditional (per configured review flow) |
| Closeout/dispute summaries, anything affecting payment or closeout | Yes |

Every AI call is logged (`AIOutputLog`): touchpoint, prompt version, model,
input summary, output, exposed?, reviewed?, decision, timestamp.

---

## 7. Content artifacts to author in M0

These are business/content artifacts, not code, and matching/scoping are
meaningless until they exist. Author them in M0 and store them as skills + seed data:

- **Scoping Matrix** — specialization → function → responsibility category → use
  case → required inputs → deliverable pattern → acceptance-criteria pattern →
  exclusions → suitability. Seed enough real rows to run intake and scoping.
  → `.claude/skills/scoping-matrix/`
- **Skill taxonomy (seed)** — predefined specialization-specific tags, mapped to
  Scoping Matrix categories, with an admin-review path for suggested skills.
  → `.claude/skills/skill-taxonomy/`
- **Sample / test data** — sample client org + user, consultant profiles (with
  restrictions), a project request, a Scoping Matrix classification, an AI scope
  draft, an approved scope, a shortlist, invitation, proposal, engagement,
  communication, deliverable, QA notes, revision request, dispute, feedback.

---

## 8. Scaffolding to stand up in M0

- Repo initialized; `CLAUDE.md` in root (committed); `.claude/skills/` created with
  the skills referenced above (`entity-dictionary`, `state-machine`, `permissions`,
  `ai-gates`, `scoping-matrix`, `skill-taxonomy`).
- Dev / test / prod environments; secrets management; `.env` documented.
- CI: install → lint → typecheck → test on every PR. A `claude -p` review step is
  optional and can be added after M1.
- Error monitoring (Sentry) wired into all environments.
- Hooks: run lint/typecheck after edits; block commits containing secrets; protect
  migrations and permission files from unreviewed writes.
- A `security-reviewer` subagent defined in `.claude/agents/` (payments, PII,
  auth, permissions are its focus).
- Decision log started (append-only): every material decision + who approved it.

---

## 9. Out of scope for MVP A (guardrail)

If a request matches anything here, do NOT build it — log it as MVP B / True
Platform. This list is the scope guardrail referenced by `CLAUDE.md`.

Fully autonomous matching, routing, or consultant assignment · fully automated
dispute settlement · complex client team permissions / enterprise account
hierarchy · sophisticated Stripe Connect / escrow logic unless the pilot requires
it · open-ended chat · consultant community features · advanced analytics · native
mobile app · native video · polished enterprise design system · microservices.

---

## 10. Gate 0 exit criteria

M0 is done when the founder and the fractional senior engineer sign off on all of:

- [ ] Stack, hosting, CI, and security posture for PII/verification artifacts
      confirmed and recorded in the decision log; `CLAUDE.md §Stack` filled in.
- [ ] Module map (§5) agreed.
- [ ] Core entity list + the three separate consultant statuses agreed; the
      `entity-dictionary` skill seeded with identity/status/relationship fields for
      the spine subset.
- [ ] Spine state machines (§6.2) written into the `state-machine` skill.
- [ ] Permission invariants (§6.3) written into the `permissions` skill.
- [ ] AI approval-gate table (§6.4) written into the `ai-gates` skill.
- [ ] Scoping Matrix and seed skill taxonomy authored with enough real rows to run
      intake + scoping.
- [ ] Sample/test data set created.
- [ ] Repo, environments, CI, error monitoring, hooks, and the security-reviewer
      subagent stood up.
- [ ] Decision log live.

**End-to-end verification (defines "M1 works"):** a founder can drive one project,
acting as each role, all the way through — intake → scope approved → consultant
onboarded and shortlisted → invited → proposal → selected → engagement →
deliverable → closeout — with every gated AI output routed to admin approval and
every state change recorded, and no client ever seeing internal or unapproved data.
M1 is not done until an automated test asserts this path and the permission
invariants hold.

---

## 11. Milestone map

M0 Foundation (this doc) → **M1 Walking skeleton** (spine end-to-end, AI stubbed)
→ M2 Intake & scoping → M3 Consultant onboarding & restrictions → M4 Matching,
shortlist, invitations → M5 Proposal, selection, engagement → M6 Delivery,
communication, AI QA, closeout, feedback → M7 Payment status, disputes, exceptions,
hardening. Each milestone ends in a demo + go/adjust/stop gate tied to the
validation assumptions in §2.