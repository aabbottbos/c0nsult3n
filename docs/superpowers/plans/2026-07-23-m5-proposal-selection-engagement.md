# M5 — Proposal, Selection, Engagement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the full proposal → deviation review → consultant selection → engagement creation flow so clients can select a consultant from the shortlist and an engagement is created automatically.

**Architecture:** Extend existing `modules/proposals/` and `modules/engagements/` services. Schema migration adds `PENDING_ADMIN_REVIEW`, `NOT_SELECTED`, and `WITHDRAWN` to `ProposalStatus`, plus deviation review fields to `Proposal`. `selectProposal` is expanded to also call `createEngagement` and mark sibling proposals `NOT_SELECTED` atomically. A deviation gate blocks client selection until admin reviews. The consultant proposal form gains optional structured deviation fields. Admin proposal detail gains approve/reject deviation buttons.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Neon Postgres, Clerk auth; existing service + Server Action patterns.

---

## File Map

**Schema:**
- `prisma/schema.prisma` — add `PENDING_ADMIN_REVIEW`, `NOT_SELECTED`, `WITHDRAWN` to `ProposalStatus`; add `deviationReviewedAt DateTime?`, `deviationReviewedBy String?`, `deviationsApproved Boolean?` to `Proposal`

**Services (modify):**
- `modules/proposals/service.ts` — update `createProposal` (deviation → `PENDING_ADMIN_REVIEW`), add `reviewDeviations`, `withdrawProposal`; update `selectProposal` to call `createEngagement` + mark siblings `NOT_SELECTED`

**Services (read-only reference):**
- `modules/engagements/service.ts` — `createEngagement(data, actorId)` already exists; call it from `selectProposal`
- `modules/proposals/types.ts` — update `PROPOSAL_TRANSITIONS` to include new statuses

**Server Actions (modify):**
- `app/(admin)/proposals/actions.ts` — add `reviewDeviationsAction`, update `selectProposalAction` to redirect to project
- `app/(consultant)/invitations/actions.ts` — update `submitProposalAction` to pass deviation fields from form; add `withdrawProposalAction`

**Pages (modify):**
- `app/(admin)/proposals/[id]/page.tsx` — show deviation fields; add "Approve Deviations" / "Reject" buttons when status is `PENDING_ADMIN_REVIEW`
- `app/(consultant)/invitations/[id]/page.tsx` — add optional deviation fields to proposal form; show "Withdraw" button on submitted proposal
- `app/(client)/projects/[id]/page.tsx` — block "Select" button with status message when proposal is `PENDING_ADMIN_REVIEW`

**Tests:**
- `tests/proposals.test.ts` — new file: 5 tests (deviation gate, engagement creation on selection, siblings NOT_SELECTED, withdraw, consultant isolation)

---

## Task 1: Schema migration — new ProposalStatus values + deviation review fields

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Update schema**

In `prisma/schema.prisma`, update the `ProposalStatus` enum and `Proposal` model:

```prisma
enum ProposalStatus {
  DRAFT
  SUBMITTED
  PENDING_ADMIN_REVIEW
  NOT_SELECTED
  SELECTED
  REJECTED
  WITHDRAWN
}
```

Add three nullable fields to the `Proposal` model (after `deviations`):

```prisma
model Proposal {
  id                   String         @id @default(cuid())
  invitationId         String
  consultantId         String
  status               ProposalStatus @default(DRAFT)
  fitStatement         String
  deviations           Json           @default("{}")
  deviationReviewedAt  DateTime?
  deviationReviewedBy  String?
  deviationsApproved   Boolean?
  createdAt            DateTime       @default(now())
  updatedAt            DateTime       @updatedAt

  invitation  ConsultantInvitation @relation(fields: [invitationId], references: [id])
  consultant  ConsultantProfile    @relation(fields: [consultantId], references: [id])
  engagements Engagement[]
}
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx prisma migrate dev --name m5_proposal_statuses
```

Expected: migration file created, Prisma client regenerated, no errors.

- [ ] **Step 3: Verify generated types**

```bash
npx prisma generate
```

Expected: no errors. The `ProposalStatus` enum in `app/generated/prisma/` now includes `PENDING_ADMIN_REVIEW`, `NOT_SELECTED`, `WITHDRAWN`.

- [ ] **Step 4: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(m5): add PENDING_ADMIN_REVIEW/NOT_SELECTED/WITHDRAWN to ProposalStatus; add deviation review fields"
```

---

## Task 2: Update PROPOSAL_TRANSITIONS and proposal service

**Files:**
- Modify: `modules/proposals/types.ts`
- Modify: `modules/proposals/service.ts`

Context: `createEngagement` in `modules/engagements/service.ts` already exists and handles email sending. It takes `{ projectId, scopeId, proposalId, consultantId, clientId }`. To get `scopeId` and `clientId` we load the project (which has `clientId` for the org) and the latest approved scope.

- [ ] **Step 1: Write the failing tests first** (in `tests/proposals.test.ts` — see Task 5 for full test file; write just this subset now)

Create `tests/proposals.test.ts` with these two tests:

```typescript
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation } from '@/modules/invitations/service'
import { createProposal, selectProposal, reviewDeviations, withdrawProposal } from '@/modules/proposals/service'

async function buildInvitation() {
  const admin = await upsertUser({ clerkId: 'm5_admin_t2', email: 'admin@m5t2.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'm5_client_t2', email: 'client@m5t2.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'm5_cons_t2', email: 'cons@m5t2.test', role: 'consultant' })
  const org = await createOrganization({ name: 'M5 T2 Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: 'client@m5t2.test' }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)
  let project = await createProject({ clientId: org.id, title: 'M5 T2 Project', description: 'test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)
  const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
  await moveToAdminReview(scope.id, admin.id)
  await approveScope(scope.id, admin.id)
  await confirmScope(scope.id, admin.id)
  project = await markReadyForMatching(project.id, admin.id)
  project = await markMatchingInProgress(project.id, admin.id)
  const shortlist = await createShortlist({ projectId: project.id }, admin.id)
  await addCandidate(shortlist.id, profile.id, admin.id)
  await submitForAdminReview(shortlist.id, admin.id)
  await makeClientVisible(shortlist.id, admin.id)
  const shortlistCandidate = await prisma.shortlistCandidate.findFirstOrThrow({ where: { shortlistId: shortlist.id } })
  const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: shortlistCandidate.id, expiresAt: null }, admin.id)
  await sendInvitation(invitation.id, admin.id)
  return { admin, org, profile, project, scope, invitation }
}

describe('M5 proposal and selection', () => {
  it('proposal with deviations is gated in PENDING_ADMIN_REVIEW; cannot be selected by client', async () => {
    const { admin, profile, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit', deviations: { fee: 'Need $200 more' } },
      profile.id
    )
    expect(proposal.status).toBe('PENDING_ADMIN_REVIEW')
    await expect(selectProposal(proposal.id, admin.id)).rejects.toThrow()
  })

  it('after admin approves deviations, proposal moves to SUBMITTED and can be selected', async () => {
    const { admin, org, profile, project, scope, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit', deviations: { fee: 'Need $200 more' } },
      profile.id
    )
    expect(proposal.status).toBe('PENDING_ADMIN_REVIEW')
    await reviewDeviations(proposal.id, true, admin.id)
    const refreshed = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })
    expect(refreshed.status).toBe('SUBMITTED')
    expect(refreshed.deviationsApproved).toBe(true)
    const contact = await prisma.clientContact.findFirstOrThrow({ where: { organizationId: org.id } })
    await selectProposal(proposal.id, contact.userId)
    const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
    expect(engagement.projectId).toBe(project.id)
    expect(engagement.scopeId).toBe(scope.id)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx vitest run tests/proposals.test.ts
```

Expected: FAIL — `reviewDeviations` not exported.

- [ ] **Step 3: Update `modules/proposals/types.ts`**

Replace the file entirely:

```typescript
import type { ProposalStatus } from '@/app/generated/prisma'

export type { ProposalStatus }

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'],
  PENDING_ADMIN_REVIEW: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['SELECTED', 'REJECTED', 'NOT_SELECTED', 'WITHDRAWN'],
  SELECTED: [],
  REJECTED: [],
  NOT_SELECTED: [],
  WITHDRAWN: [],
}
```

- [ ] **Step 4: Update `modules/proposals/service.ts`**

Replace the file entirely:

```typescript
import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markProposalSubmitted } from '@/modules/invitations/service'
import { createEngagement } from '@/modules/engagements/service'
import type { Prisma } from '@/app/generated/prisma'

function hasDeviations(deviations: unknown): boolean {
  if (!deviations || typeof deviations !== 'object') return false
  return Object.values(deviations as Record<string, unknown>).some(v => v !== null && v !== undefined && v !== '')
}

export async function createProposal(
  data: { invitationId: string; consultantId: string; fitStatement: string; deviations?: Record<string, unknown> },
  actorId: string
) {
  const deviations = data.deviations ?? {}
  const withDeviations = hasDeviations(deviations)
  const status = withDeviations ? 'PENDING_ADMIN_REVIEW' : 'SUBMITTED'

  const proposal = await db.$transaction(async (tx: Tx) => {
    const p = await tx.proposal.create({
      data: { ...data, deviations: deviations as unknown as Prisma.InputJsonValue, status },
    })
    await logEvent(tx, { entityType: 'Proposal', entityId: p.id, action: 'create', actorId, actorRole: 'consultant' })
    return p
  })

  if (status === 'SUBMITTED') {
    await markProposalSubmitted(data.invitationId, actorId)
  }
  return proposal
}

export async function reviewDeviations(proposalId: string, approved: boolean, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (proposal.status !== 'PENDING_ADMIN_REVIEW') throw new Error(`Cannot review deviations in status ${proposal.status}`)
    const nextStatus = approved ? 'SUBMITTED' : 'REJECTED'
    const updated = await tx.proposal.update({
      where: { id: proposalId },
      data: { status: nextStatus, deviationsApproved: approved, deviationReviewedAt: new Date(), deviationReviewedBy: actorId },
    })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: approved ? 'approve_deviations' : 'reject_deviations', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function withdrawProposal(proposalId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (!['SUBMITTED', 'PENDING_ADMIN_REVIEW'].includes(proposal.status)) throw new Error(`Cannot withdraw proposal in status ${proposal.status}`)
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'WITHDRAWN' } })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: 'withdraw', actorId, actorRole: 'consultant' })
    return updated
  })
}

export async function selectProposal(proposalId: string, actorId: string) {
  const proposal = await db.$transaction(async (tx: Tx) => {
    const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (p.status !== 'SUBMITTED') throw new Error(`Cannot select proposal in status ${p.status}`)
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'SELECTED' } })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: 'select', actorId, actorRole: 'client' })
    return updated
  })

  // Load invitation to get projectId
  const invitation = await db.consultantInvitation.findUniqueOrThrow({ where: { id: proposal.invitationId } })

  // Load project to get clientId and approved scope
  const project = await db.project.findUniqueOrThrow({ where: { id: invitation.projectId } })
  const scope = await db.scope.findFirstOrThrow({
    where: { projectId: invitation.projectId, status: 'CLIENT_CONFIRMED' },
  })

  // Create engagement
  await createEngagement(
    { projectId: invitation.projectId, scopeId: scope.id, proposalId, consultantId: proposal.consultantId, clientId: project.clientId },
    actorId
  )

  // Mark all other SUBMITTED/PENDING_ADMIN_REVIEW proposals for this project as NOT_SELECTED
  const otherProposals = await db.proposal.findMany({
    where: {
      id: { not: proposalId },
      status: { in: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'] },
      invitation: { projectId: invitation.projectId },
    },
  })
  for (const other of otherProposals) {
    await db.$transaction(async (tx: Tx) => {
      await tx.proposal.update({ where: { id: other.id }, data: { status: 'NOT_SELECTED' } })
      await logEvent(tx, { entityType: 'Proposal', entityId: other.id, action: 'not_selected', actorId, actorRole: 'client' })
    })
  }

  return proposal
}

export async function listProposals() {
  return db.proposal.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getProposal(id: string) {
  return db.proposal.findUnique({ where: { id } })
}
```

- [ ] **Step 5: Run the two tests**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx vitest run tests/proposals.test.ts
```

Expected: both tests PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add modules/proposals/service.ts modules/proposals/types.ts tests/proposals.test.ts
git commit -m "feat(m5): deviation gate, reviewDeviations, withdrawProposal; selectProposal creates engagement + marks siblings NOT_SELECTED"
```

---

## Task 3: Complete the proposals test file (remaining 3 tests)

**Files:**
- Modify: `tests/proposals.test.ts`

- [ ] **Step 1: Add 3 more tests to `tests/proposals.test.ts`**

Append inside the `describe('M5 proposal and selection', ...)` block (after the existing two `it(...)` calls, before the closing `})`):

```typescript
  it('proposal without deviations is immediately SUBMITTED', async () => {
    const { profile, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit' },
      profile.id
    )
    expect(proposal.status).toBe('SUBMITTED')
  })

  it('consultant can withdraw a SUBMITTED proposal', async () => {
    const { profile, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit' },
      profile.id
    )
    expect(proposal.status).toBe('SUBMITTED')
    await withdrawProposal(proposal.id, profile.id)
    const refreshed = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })
    expect(refreshed.status).toBe('WITHDRAWN')
  })

  it('selecting a consultant marks sibling proposals NOT_SELECTED', async () => {
    const admin = await upsertUser({ clerkId: 'm5_admin_sib', email: 'admin@m5sib.test', role: 'admin' })
    const clientUser = await upsertUser({ clerkId: 'm5_client_sib', email: 'client@m5sib.test', role: 'client' })
    const consultantUser1 = await upsertUser({ clerkId: 'm5_cons_sib1', email: 'cons1@m5sib.test', role: 'consultant' })
    const consultantUser2 = await upsertUser({ clerkId: 'm5_cons_sib2', email: 'cons2@m5sib.test', role: 'consultant' })
    const org = await createOrganization({ name: 'M5 Sib Corp' }, admin.id)
    await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: 'client@m5sib.test' }, admin.id)
    const profile1 = await createProfile({ userId: consultantUser1.id }, admin.id)
    const profile2 = await createProfile({ userId: consultantUser2.id }, admin.id)
    await approveProfile(profile1.id, admin.id); await publishProfile(profile1.id, admin.id)
    await approveProfile(profile2.id, admin.id); await publishProfile(profile2.id, admin.id)

    let project = await createProject({ clientId: org.id, title: 'M5 Sib Project', description: 'test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    await confirmScope(scope.id, admin.id)
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)
    const shortlist = await createShortlist({ projectId: project.id }, admin.id)
    await addCandidate(shortlist.id, profile1.id, admin.id)
    await addCandidate(shortlist.id, profile2.id, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)
    const [sc1, sc2] = await prisma.shortlistCandidate.findMany({ where: { shortlistId: shortlist.id } })
    const inv1 = await createInvitation({ projectId: project.id, consultantId: profile1.id, shortlistCandidateId: sc1.id, expiresAt: null }, admin.id)
    const inv2 = await createInvitation({ projectId: project.id, consultantId: profile2.id, shortlistCandidateId: sc2.id, expiresAt: null }, admin.id)
    await sendInvitation(inv1.id, admin.id)
    await sendInvitation(inv2.id, admin.id)

    const proposal1 = await createProposal({ invitationId: inv1.id, consultantId: profile1.id, fitStatement: 'Fit 1' }, profile1.id)
    const proposal2 = await createProposal({ invitationId: inv2.id, consultantId: profile2.id, fitStatement: 'Fit 2' }, profile2.id)

    const contact = await prisma.clientContact.findFirstOrThrow({ where: { organizationId: org.id } })
    await selectProposal(proposal1.id, contact.userId)

    const sibling = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal2.id } })
    expect(sibling.status).toBe('NOT_SELECTED')
    const engagements = await prisma.engagement.findMany({ where: { projectId: project.id } })
    expect(engagements).toHaveLength(1)
    expect(engagements[0].consultantId).toBe(profile1.id)
  })
```

- [ ] **Step 2: Run all proposal tests**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx vitest run tests/proposals.test.ts
```

Expected: 5/5 PASS.

- [ ] **Step 3: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add tests/proposals.test.ts
git commit -m "test(m5): add withdraw and sibling NOT_SELECTED tests"
```

---

## Task 4: Admin proposal detail — deviation review UI + actions

**Files:**
- Modify: `app/(admin)/proposals/[id]/page.tsx`
- Modify: `app/(admin)/proposals/actions.ts`

Context: The admin proposal detail at `/proposals/[id]` already shows fit statement and a "Select Proposal" button for `SUBMITTED` status. We need to: (a) show deviation fields if present; (b) add "Approve Deviations" / "Reject" buttons when status is `PENDING_ADMIN_REVIEW`; (c) remove the admin "Select Proposal" button (client selects, not admin). The `selectProposal` service is now called from the client portal, not admin. Keep `selectProposalAction` in `app/(admin)/proposals/actions.ts` for completeness but it's no longer wired to a button in the UI.

- [ ] **Step 1: Add `reviewDeviationsAction` to `app/(admin)/proposals/actions.ts`**

Replace the file:

```typescript
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { reviewDeviations } from '@/modules/proposals/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function approveDeviationsAction(id: string) {
  await reviewDeviations(id, true, await actorId())
  redirect(`/proposals/${id}`)
}

export async function rejectDeviationsAction(id: string) {
  await reviewDeviations(id, false, await actorId())
  redirect(`/proposals/${id}`)
}
```

- [ ] **Step 2: Update `app/(admin)/proposals/[id]/page.tsx`**

Replace the file:

```typescript
import { notFound } from 'next/navigation'
import { getProposal } from '@/modules/proposals/service'
import { db } from '@/lib/db'
import { approveDeviationsAction, rejectDeviationsAction } from '../actions'

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const proposal = await getProposal(id)
  if (!proposal) notFound()

  const invitation = await db.consultantInvitation.findUnique({ where: { id: proposal.invitationId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })

  const deviations = proposal.deviations as Record<string, string> | null
  const hasDeviations = deviations && Object.values(deviations).some(v => v)

  return (
    <div className="p-8 space-y-6">
      <a href="/proposals" className="text-sm text-indigo-600 hover:underline">← Proposals</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Proposal</h1>
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
          proposal.status === 'PENDING_ADMIN_REVIEW' ? 'bg-amber-100 text-amber-700' :
          proposal.status === 'SELECTED' ? 'bg-green-100 text-green-700' :
          proposal.status === 'REJECTED' || proposal.status === 'NOT_SELECTED' || proposal.status === 'WITHDRAWN' ? 'bg-red-100 text-red-700' :
          'bg-slate-100 text-slate-700'
        }`}>{proposal.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Invitation</dt><dd><a href={`/invitations/${proposal.invitationId}`} className="text-indigo-600 hover:underline">{proposal.invitationId.slice(0, 12)}…</a></dd></div>
          {invitation && <div><dt className="text-slate-500">Project</dt><dd><a href={`/admin/projects/${invitation.projectId}`} className="text-indigo-600 hover:underline">{invitation.projectId.slice(0, 12)}…</a></dd></div>}
          <div className="col-span-2"><dt className="text-slate-500 mb-1">Fit statement</dt><dd className="text-slate-900">{proposal.fitStatement}</dd></div>
        </dl>
      </div>

      {hasDeviations && (
        <div className="bg-white rounded-lg border border-amber-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-amber-800">Requested Deviations</h2>
          <dl className="space-y-2 text-sm">
            {deviations && Object.entries(deviations).filter(([, v]) => v).map(([key, value]) => (
              <div key={key}>
                <dt className="text-slate-500 capitalize">{key}</dt>
                <dd className="text-slate-900 mt-0.5">{value}</dd>
              </div>
            ))}
          </dl>
          {proposal.deviationReviewedAt && (
            <p className="text-xs text-slate-400">
              {proposal.deviationsApproved ? 'Approved' : 'Rejected'} on {proposal.deviationReviewedAt.toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {proposal.status === 'PENDING_ADMIN_REVIEW' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Review Deviations</h2>
          <p className="text-sm text-slate-500">Approve to allow the client to select this consultant, or reject to remove this proposal from consideration.</p>
          <div className="flex gap-3">
            <form action={approveDeviationsAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700">Approve Deviations</button>
            </form>
            <form action={rejectDeviationsAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-50 text-red-600 hover:bg-red-100">Reject</button>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Event Log</h2>
        {events.length === 0 ? <p className="text-sm text-slate-400">No events.</p> : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="text-xs text-slate-600">
                <span className="font-medium">{e.action}</span> by {e.actorRole} · {e.timestamp.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add app/\(admin\)/proposals/actions.ts app/\(admin\)/proposals/\[id\]/page.tsx
git commit -m "feat(m5): admin proposal detail — deviation review UI and approve/reject actions"
```

---

## Task 5: Consultant proposal form — deviation fields + withdraw button

**Files:**
- Modify: `app/(consultant)/invitations/[id]/page.tsx`
- Modify: `app/(consultant)/invitations/actions.ts`

Context: The existing form only has a `fitStatement` textarea. We add three optional deviation fields: `deviationFee`, `deviationTiming`, `deviationDeliverable`. Each is a plain text input the consultant fills in only if they want to flag a change. Empty fields are excluded from the deviations object. We also add a "Withdraw" button when a proposal is already submitted (`SUBMITTED` or `PENDING_ADMIN_REVIEW`).

- [ ] **Step 1: Add `withdrawProposalAction` to `app/(consultant)/invitations/actions.ts`**

Replace the file:

```typescript
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProposal, withdrawProposal } from '@/modules/proposals/service'
import { declineInvitation } from '@/modules/invitations/service'

async function consultantProfileId() {
  await requireRole('consultant')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })
  return { userId: user.id, profileId: profile.id }
}

export async function submitProposalAction(invitationId: string, formData: FormData) {
  const { profileId } = await consultantProfileId()
  const fitStatement = formData.get('fitStatement') as string
  const deviationFee = (formData.get('deviationFee') as string | null)?.trim() || undefined
  const deviationTiming = (formData.get('deviationTiming') as string | null)?.trim() || undefined
  const deviationDeliverable = (formData.get('deviationDeliverable') as string | null)?.trim() || undefined
  const deviations: Record<string, string> = {}
  if (deviationFee) deviations.fee = deviationFee
  if (deviationTiming) deviations.timing = deviationTiming
  if (deviationDeliverable) deviations.deliverable = deviationDeliverable
  await createProposal({ invitationId, consultantId: profileId, fitStatement, deviations }, profileId)
  redirect(`/invitations/${invitationId}`)
}

export async function withdrawProposalAction(proposalId: string, invitationId: string) {
  const { profileId } = await consultantProfileId()
  await withdrawProposal(proposalId, profileId)
  redirect(`/invitations/${invitationId}`)
}

export async function declineInvitationAction(invitationId: string) {
  const { profileId } = await consultantProfileId()
  await declineInvitation(invitationId, profileId)
  redirect('/invitations')
}
```

- [ ] **Step 2: Update `app/(consultant)/invitations/[id]/page.tsx`**

Replace the file:

```typescript
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitProposalAction, declineInvitationAction, withdrawProposalAction } from '../actions'

export default async function ConsultantInvitationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const invitation = await db.consultantInvitation.findUnique({
    where: { id, consultantId: profile.id },
    include: {
      project: { include: { scope: true } },
      proposals: { where: { consultantId: profile.id } },
    },
  })
  if (!invitation) notFound()

  const existingProposal = invitation.proposals[0] ?? null
  const canRespond = ['SENT', 'VIEWED', 'QUESTIONS_ASKED'].includes(invitation.status)
  const canWithdraw = existingProposal && ['SUBMITTED', 'PENDING_ADMIN_REVIEW'].includes(existingProposal.status)

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <a href="/invitations" className="text-sm text-indigo-600 hover:underline">← Invitations</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{invitation.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{invitation.status}</span>
      </div>

      {invitation.project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.deliverable}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.acceptanceCriteria}</dd></div>
            <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${invitation.project.scope.fee.toString()}</dd></div>
            <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.effortCapHours}h</dd></div>
            <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.dueDate.toLocaleDateString()}</dd></div>
            {invitation.project.scope.assumptions && <div className="col-span-2"><dt className="text-slate-500">Assumptions</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.assumptions}</dd></div>}
            {invitation.project.scope.exclusions && <div className="col-span-2"><dt className="text-slate-500">Exclusions</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.exclusions}</dd></div>}
          </dl>
        </div>
      )}

      {existingProposal ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Your Proposal</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              existingProposal.status === 'PENDING_ADMIN_REVIEW' ? 'bg-amber-100 text-amber-700' :
              existingProposal.status === 'SELECTED' ? 'bg-green-100 text-green-700' :
              existingProposal.status === 'WITHDRAWN' || existingProposal.status === 'NOT_SELECTED' || existingProposal.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-700'
            }`}>{existingProposal.status}</span>
          </div>
          <p className="text-sm text-slate-600">{existingProposal.fitStatement}</p>
          {existingProposal.status === 'PENDING_ADMIN_REVIEW' && (
            <p className="text-xs text-amber-700">Your proposal includes deviations and is under admin review before the client can see it.</p>
          )}
          <p className="text-xs text-slate-400">Submitted {existingProposal.createdAt.toLocaleDateString()}</p>
          {canWithdraw && (
            <form action={withdrawProposalAction.bind(null, existingProposal.id, invitation.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-50 text-red-600 hover:bg-red-100">Withdraw Proposal</button>
            </form>
          )}
        </div>
      ) : canRespond ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Submit Your Proposal</h2>
          <form action={submitProposalAction.bind(null, invitation.id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Why are you a strong fit?</label>
              <textarea
                name="fitStatement"
                required
                rows={5}
                placeholder="Describe your relevant experience, approach, and why you're well-suited for this specific scope..."
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Request changes to scope (optional)</p>
              <p className="text-xs text-slate-500">Leave blank if you agree with the scope as written. Any changes require admin review before the client can select you.</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fee change</label>
                <input type="text" name="deviationFee" placeholder="e.g. I need $200 more due to additional complexity" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Timeline change</label>
                <input type="text" name="deviationTiming" placeholder="e.g. I can deliver by Feb 15 instead of Feb 1" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable change</label>
                <input type="text" name="deviationDeliverable" placeholder="e.g. I'd deliver a slide deck instead of a written report" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit Proposal</button>
              <form action={declineInvitationAction.bind(null, invitation.id)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-50 text-red-600 hover:bg-red-100">Decline</button>
              </form>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add app/\(consultant\)/invitations/\[id\]/page.tsx app/\(consultant\)/invitations/actions.ts
git commit -m "feat(m5): consultant proposal form — deviation fields and withdraw button"
```

---

## Task 6: Client project detail — block selection for PENDING_ADMIN_REVIEW proposals

**Files:**
- Modify: `app/(client)/projects/[id]/page.tsx`

Context: When a proposal is in `PENDING_ADMIN_REVIEW`, the client sees it on the shortlist but cannot select it yet. The "Select this consultant" button should be replaced with a "Pending admin review" badge. The `selectProposalAction` already calls `selectProposal` which throws if status isn't `SUBMITTED`, but we also want to give the client a clear UI message.

The current query loads `proposals: { where: { status: 'SUBMITTED' } }` — which already hides `PENDING_ADMIN_REVIEW` proposals from the shortlist view. We need to also show those with a "pending review" indicator, so clients know a proposal is in flight.

- [ ] **Step 1: Update the shortlist query and render in `app/(client)/projects/[id]/page.tsx`**

In the `db.project.findUnique` call, change the `proposals` filter from `status: 'SUBMITTED'` to `status: { in: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'] }`:

```typescript
const project = await db.project.findUnique({
  where: { id, clientId: contact.organizationId },
  include: {
    scope: true,
    shortlist: {
      include: {
        candidates: {
          include: {
            consultant: true,
            invitations: {
              include: { proposals: { where: { status: { in: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'] } } } },
            },
          },
        },
      },
    },
    engagements: {
      where: { status: { notIn: ['CANCELLED'] } },
      include: {
        deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      take: 1,
    },
  },
})
```

Then update the shortlist candidate render block (inside `project.status === 'SHORTLIST_READY'`) to show a "Pending admin review" badge when the proposal is in `PENDING_ADMIN_REVIEW`:

```typescript
{project.shortlist.candidates.map(c => {
  const proposal = c.invitations.flatMap(i => i.proposals)[0] ?? null
  const isPendingReview = proposal?.status === 'PENDING_ADMIN_REVIEW'
  return (
    <div key={c.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-medium text-slate-900 text-sm">Consultant {c.consultantId.slice(0, 8)}…</div>
          {c.rationale && <p className="text-sm text-slate-600 mt-1 italic">"{c.rationale}"</p>}
        </div>
        {isPendingReview
          ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">Proposal in — under review</span>
          : proposal
            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Proposal in</span>
            : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">Awaiting proposal</span>
        }
      </div>
      {proposal && !isPendingReview && (
        <>
          <p className="text-sm text-slate-700">{proposal.fitStatement}</p>
          <form action={selectProposalAction.bind(null, proposal.id, project.id)}>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Select this consultant</button>
          </form>
        </>
      )}
      {isPendingReview && (
        <p className="text-xs text-slate-500">This consultant has proposed some scope adjustments. We're reviewing them and will update you shortly.</p>
      )}
    </div>
  )
})}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm test
```

Expected: all tests pass (16 prior + 5 new = 21/21).

- [ ] **Step 4: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add app/\(client\)/projects/\[id\]/page.tsx
git commit -m "feat(m5): client shortlist blocks selection for PENDING_ADMIN_REVIEW proposals"
```

---

## Task 7: Update HANDOFF.md and push

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update HANDOFF.md milestone table**

Change the M5 row (currently in "Next Work") to reflect completion. Add to the milestone table:

```
| M5 | ✅ Complete | Proposal deviation gate, consultant selection → engagement creation, sibling NOT_SELECTED, withdraw, admin deviation review UI, consultant deviation fields |
```

Update "What's Working" to add the M5 flows:

```markdown
### M5: Proposal, selection, engagement
- Consultant proposal form: fit statement + optional deviation fields (fee/timing/deliverable). If deviations present, proposal enters `PENDING_ADMIN_REVIEW` instead of `SUBMITTED`.
- Admin proposal detail: shows deviation fields with amber badge; "Approve Deviations" / "Reject" buttons when status is `PENDING_ADMIN_REVIEW`.
- Client shortlist: shows "under review" badge for `PENDING_ADMIN_REVIEW` proposals; blocks "Select" button until admin approves. Selecting a consultant calls `selectProposal` which creates the engagement and marks siblings `NOT_SELECTED`.
- Consultant can withdraw a submitted proposal (before selection).
- 21/21 tests pass.
```

Update "Next Work" to remove M5 and add M6 as the next milestone.

- [ ] **Step 2: Commit**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md with M5 complete state"
```

- [ ] **Step 3: Push to GitHub**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```

Expected: push succeeds.
