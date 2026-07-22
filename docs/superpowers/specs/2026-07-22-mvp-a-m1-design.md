# Consulten MVP A — M1 Walking Skeleton Design

Date: 2026-07-22  
Status: Approved  
Milestone: M1 (Walking Skeleton)  
Builds on: SPEC.md (M0 Foundation)

---

## 1. Goal

Build the thinnest end-to-end happy path for Consulten MVP A. At the end of M1, a founder can manually drive one project through the full spine — intake → scope approved → shortlist → invitation → proposal → engagement → closeout — acting as each role via the admin shell, with every state change recorded and every permission invariant enforced.

No AI calls (stubbed/manual). No client or consultant UI. No payments. No polish.

Success criteria: an automated test asserts the full spine path and permission invariants hold.

---

## 2. Stack (confirmed at Gate 0)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| Database | Neon (serverless Postgres) |
| ORM | Prisma |
| Auth | Clerk |
| Deployment | Vercel |
| Error monitoring | Sentry |
| AI provider | Anthropic API (stubbed in M1) |
| Payments | Stripe (wired in M7) |
| File storage | S3-compatible (wired in M6) |
| Email | Managed provider (wired in M2+) |

---

## 3. Build approach: Admin-first skeleton

Stand up auth + roles + the admin dashboard shell first, then layer in entities and screens one module at a time behind the admin surface. Admin sees everything; client and consultant surfaces come later.

Rationale: the spec is explicit that admin mediates everything in MVP A. Building admin-first means you have a real surface to drive the spine from day one. Client/consultant route groups exist in M1 but return `notFound()` — they are born correctly restricted.

---

## 4. Repository structure

```
consulten/
├── app/
│   ├── (admin)/                  # Admin route group (Clerk role: admin)
│   │   ├── layout.tsx            # Admin layout + sidebar nav
│   │   └── dashboard/
│   │       └── page.tsx
│   ├── (client)/                 # Locked until M2+ — returns notFound()
│   ├── (consultant)/             # Locked until M4+ — returns notFound()
│   └── api/
│       ├── webhooks/
│       │   └── clerk/route.ts    # Syncs Clerk user → local User table
│       └── ...
├── modules/                      # Business-domain modules (modular monolith)
│   ├── auth-users/
│   │   ├── service.ts
│   │   └── types.ts
│   ├── clients/
│   ├── consultants/
│   ├── projects/
│   ├── scopes/
│   ├── matching/
│   ├── shortlists/
│   ├── invitations/
│   ├── proposals/
│   ├── engagements/
│   ├── deliverables/
│   ├── communications/
│   ├── disputes/
│   ├── payments/
│   ├── notifications/
│   ├── ai/
│   ├── admin/
│   └── audit-events/
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── lib/
│   ├── db.ts                     # Prisma client singleton
│   └── auth.ts                   # Clerk helpers + requireRole()
├── .claude/
│   └── skills/                   # entity-dictionary, state-machine, permissions, ai-gates, etc.
└── docs/
    └── superpowers/
        └── specs/
```

**Module boundary rule:** a module reaches another module only through its `service.ts`. Direct `db.*` queries into another module's tables are forbidden.

---

## 5. Auth & roles

Three roles: `admin`, `client`, `consultant`. Role stored in Clerk `publicMetadata.role`.

- Clerk middleware enforces authentication on all routes.
- `requireRole(role)` in `lib/auth.ts` wraps every server component and API route. Wrong role → `notFound()`.
- Clerk webhook (`/api/webhooks/clerk`) syncs user data into the local `User` table on `user.created` / `user.updated`.
- Admin role assignment: Clerk dashboard for real admin accounts; seed script promotes specified emails for test accounts.

---

## 6. Spine entities (Prisma schema)

M1 entities need identity fields, status, and relationships. Rich field sets are filled in per later milestone.

### Auth & people

| Entity | Key fields |
|---|---|
| `User` | id, clerkId, email, role (admin\|client\|consultant), createdAt |
| `ClientOrganization` | id, name, status |
| `ClientContact` | id, userId, organizationId, name, email |
| `ConsultantProfile` | id, userId, approvalStatus, accountStatus, publicationStatus |
| `ConsultantRestriction` | id, consultantId, type, notes, activeFrom, activeTo |

`ConsultantProfile` has **three separate status fields** — they must never be collapsed:
- `approvalStatus`: pending \| approved \| rejected (Consulten approval)
- `accountStatus`: active \| suspended \| deactivated
- `publicationStatus`: draft \| published \| unpublished

### Project spine

| Entity | Key fields |
|---|---|
| `Project` | id, clientId, status, title, description |
| `Scope` | id, projectId, status, deliverable, acceptanceCriteria, assumptions, exclusions, dueDate, fee, effortCapHours |
| `Shortlist` | id, projectId, status |
| `ShortlistCandidate` | id, shortlistId, consultantId, addedBy (adminId) |
| `ConsultantInvitation` | id, shortlistCandidateId, projectId, consultantId, status, sentAt, expiresAt |
| `Proposal` | id, invitationId, consultantId, status, fitStatement, deviations (JSON) |
| `Engagement` | id, projectId, scopeId, proposalId, consultantId, clientId, status |
| `Deliverable` | id, engagementId, status, submittedAt, fileUrl |

### Cross-cutting (all milestones)

| Entity | Key fields |
|---|---|
| `AIOutputLog` | id, touchpoint, promptVersion, model, inputSummary, output, exposed, reviewed, decision, timestamp |
| `EventLog` | id, entityType, entityId, action, actorId, actorRole, data (JSON), timestamp |
| `LegalAcceptanceRecord` | id, userId, documentType, version, acceptedAt, ipAddress (immutable — insert only) |

Also present in schema but empty in M1: `Dispute`, `Notification`, `AdminTask`, `ScopingMatrixClassification`.

---

## 7. State machines

Defined in full in `.claude/skills/state-machine`. The five M1 machines:

| Entity | Statuses |
|---|---|
| `Project` | Draft → Submitted → Under Admin Review → Scope Approved → Ready for Matching → Matching in Progress → Shortlist Ready → Engagement Created → Closed (+ Cancelled, Needs Clarification) |
| `Scope` | Not Started → AI Drafted → Admin Review → Admin Approved → Client Confirmed (+ Client Change Requested, Rejected) |
| `Shortlist` | Draft → Admin Review → Client Visible → Updated → Closed |
| `ConsultantInvitation` | Draft → Sent → Viewed \| Accepted Interest \| Declined \| Questions Asked \| Proposal Submitted → Expired \| Withdrawn |
| `Engagement` | Pending Start → In Progress → Deliverable Submitted → Under Review → Revision Requested \| Disputed → Accepted \| Closed \| Cancelled |

**Enforcement pattern:** no module sets a raw status field. Every transition goes through a service-layer action function that:
1. Validates the current status allows the transition
2. Performs side effects (related record creation, notification stubs)
3. Writes to `EventLog` inside a `db.$transaction`
4. Returns the updated entity

```ts
// Example: modules/projects/service.ts
export async function submitProject(projectId: string, actorId: string) {
  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })
  if (project.status !== 'DRAFT') throw new Error(`Invalid transition from ${project.status}`)
  return db.$transaction(async (tx) => {
    const updated = await tx.project.update({ where: { id: projectId }, data: { status: 'SUBMITTED' } })
    await tx.eventLog.create({ data: { entityType: 'Project', entityId: projectId, action: 'submit', actorId } })
    return updated
  })
}
```

---

## 8. Admin shell UI

Design system: clean Tailwind-default (white + indigo/slate). Functional — not polished. Same layout pattern for every module.

**Layout:** dark `#1e293b` sidebar + white content area split into list panel (left, 360px) and detail panel (right, flex).

**Per-module page:**
- **List view:** table of all records, status badge, key fields, link to detail
- **Detail view:** all fields, current status badge, action buttons, per-record event log
- **Action buttons:** only valid next-state transitions are shown (derived from current status)
- **Create form:** minimal fields, admin can create on behalf of any role

**Admin nav (M1 modules):** Projects · Scopes · Shortlists · Invitations · Proposals · Engagements · Deliverables · Clients · Consultants · Event Log · AI Output Log

**Status badges:** color-coded pill (indigo=review, amber=change requested, green=confirmed/closed, slate=draft/AI)

**M1 spine walkthrough (no client/consultant UI needed):**
1. Create ClientOrganization + ClientContact
2. Create ConsultantProfile → approve → publish
3. Create Project (as client) → Submit → Admin Review → Scope Approved
4. Create Scope → Admin Approve → Client Confirm
5. Create Shortlist → add candidate → Admin Review → Client Visible
6. Create ConsultantInvitation → Send → accept interest
7. Create Proposal → admin selects → Engagement created
8. Engagement In Progress → submit Deliverable → review → Closed

---

## 9. Testing & CI

**Automated test requirement (M1 exit criteria):** a test suite drives the full spine path (step 1–8 above) and asserts:
- Every state transition succeeds in order
- Invalid transitions are rejected with an error
- Permission invariants hold (client never sees unapproved/internal data, consultant never sees uninvited projects, admin-only fields never leak to other roles)

**Testing stack:**
- Vitest — unit + integration tests for service layer
- Prisma test client against a real Neon dev branch (transactions roll back after each test)
- No mocked database

**CI (GitHub Actions):** `install → lint → typecheck → test → build` on every PR. No merge without green CI.

**Hooks (`.claude/settings.json`):**
- Run ESLint + `tsc --noEmit` after file edits
- Block commits containing secrets
- Protect `prisma/migrations/` and permission-related files from unreviewed writes

---

## 10. Out of scope for M1

Per SPEC.md §9 — do not build:
- Client or consultant UI screens
- Real AI calls (all AI touchpoints return stub data)
- Payments (Stripe not wired)
- File upload (S3 not wired)
- Transactional email
- Scoping Matrix classification UI
- Matching algorithm
- Any feature from the MVP B exclusion list

---

## 11. M1 exit criteria

M1 is done when:
- [ ] All spine entities in Prisma schema, migrated to Neon dev
- [ ] Seed data populates a complete test scenario (one of each spine entity)
- [ ] All five state machines implemented in service layers with transition guards
- [ ] Permission invariants enforced via `requireRole()` on all routes and service functions
- [ ] Admin shell covers all spine modules with list + detail + action buttons
- [ ] Automated test asserts full spine path and permission invariants
- [ ] CI passing (lint + typecheck + test + build)
- [ ] Deployed to Vercel preview environment
- [ ] Founder manually walks the 8-step spine in the admin shell without error
