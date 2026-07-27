# M7 Disputes & Payment Status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Dispute flow (admin-owned escalation and resolution), PaymentTransactionRecord (manual status tracking for all three portals), and migrate `Engagement.clientId` to a proper FK `clientContactId`.

**Architecture:** Three independent subsystems share one migration. Schema changes land first, then service modules, then UI surfaces. Tests for each module validate service-layer behaviour against the real Neon dev DB; no mocks.

**Tech Stack:** Prisma 7 + Neon (serverless Postgres), Next.js 16 App Router (Server Components + Server Actions), Clerk auth, Anthropic SDK (`callClaude`), Vitest integration tests.

---

## File Map

### Created
- `modules/disputes/service.ts` — `openDispute`, `generateAiDisputeSummary`, `resolveDispute`
- `modules/payments/service.ts` — `createPaymentRecord`, `updatePaymentStatus`
- `app/(admin)/admin/disputes/page.tsx` — disputes list
- `app/(admin)/admin/disputes/[id]/page.tsx` — dispute detail: comms context, AI summary trigger, resolve form
- `app/(admin)/admin/disputes/actions.ts` — server actions: openDisputeAction, generateAiDisputeSummaryAction, resolveDisputeAction, updatePaymentStatusAction
- `tests/disputes.test.ts` — 5 dispute tests
- `tests/payments.test.ts` — 4 payment tests

### Modified
- `prisma/schema.prisma` — expand Dispute model, add DisputeStatus/PaymentStatus/PayoutStatus enums, add PaymentTransactionRecord, add clientContactId FK to Engagement, add relations
- `modules/engagements/types.ts` — add DISPUTED → ACCEPTED/REVISION_REQUESTED/CANCELLED transitions
- `modules/engagements/service.ts` — update `createEngagement` to: (1) look up clientContactId by userId, (2) call `createPaymentRecord` after engagement creation; update `acceptEngagement` to guard against open disputes
- `modules/proposals/service.ts` — update `selectProposal` to pass `clientContactId` instead of bare `clientId`
- `app/(admin)/admin/engagements/[id]/page.tsx` — add "Open Dispute" button (status UNDER_REVIEW/ACCEPTED), add dispute panel, add payment panel
- `app/(admin)/admin/engagements/actions.ts` — add `openDisputeAction`; import `updatePaymentStatusAction` from disputes/actions
- `app/(admin)/layout.tsx` — add "Disputes" nav link
- `app/(client)/projects/[id]/engagement/[engagementId]/page.tsx` — update clientId filter to clientContactId, add payment status card
- `app/(consultant)/engagements/[id]/page.tsx` — add payout status card
- `tests/setup.ts` — add `paymentTransactionRecord` and `dispute` deletes in correct FK order

---

## Task 1: Schema migration — Dispute, PaymentTransactionRecord, clientContactId

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums and expand models in schema**

Replace the stub `Dispute` model and add new enums + `PaymentTransactionRecord`. Also rename `Engagement.clientId` to `clientContactId` and add FK.

Open `prisma/schema.prisma`. Make these changes:

1. After the `CommunicationType` enum block, add three new enums:

```prisma
enum DisputeStatus {
  OPENED
  UNDER_ADMIN_REVIEW
  PROPOSED_RESOLUTION
  RESOLVED
  CLOSED
}

enum PaymentStatus {
  NOT_REQUIRED_YET
  AUTHORIZATION_PENDING
  AUTHORIZED
  PAYMENT_FAILED
  PAYMENT_CONFIRMED
  RELEASE_PENDING
  RELEASED
  REFUNDED
  DISPUTED
}

enum PayoutStatus {
  PENDING
  RELEASE_PENDING
  RELEASED
  ON_HOLD
  REFUNDED
}
```

2. In the `Engagement` model, replace `clientId String` (bare string, no relation) with:

```prisma
  clientContactId String

  clientContact    ClientContact            @relation(fields: [clientContactId], references: [id])
```

Also add these two relation fields to `Engagement`:

```prisma
  dispute          Dispute?
  paymentRecord    PaymentTransactionRecord?
```

3. Add `engagements Engagement[]` to `ClientContact` model:

```prisma
  engagements    Engagement[]
```

4. Replace the stub `Dispute` model with:

```prisma
model Dispute {
  id                 String        @id @default(cuid())
  engagementId       String        @unique
  openedBy           String
  disputeReason      String
  issueSummary       String?
  aiDisputeSummary   String?
  adminReviewStatus  DisputeStatus @default(OPENED)
  proposedResolution String?
  finalResolution    String?
  resultingStatus    EngagementStatus?
  closedAt           DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  engagement Engagement @relation(fields: [engagementId], references: [id])
}
```

5. After the Dispute model, add:

```prisma
model PaymentTransactionRecord {
  id             String        @id @default(cuid())
  engagementId   String        @unique
  amount         Decimal       @db.Decimal(10, 2)
  platformFee    Decimal?      @db.Decimal(10, 2)
  payoutAmount   Decimal?      @db.Decimal(10, 2)
  paymentStatus  PaymentStatus @default(NOT_REQUIRED_YET)
  payoutStatus   PayoutStatus  @default(PENDING)
  paymentDueDate DateTime?
  adminNotes     String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  engagement Engagement @relation(fields: [engagementId], references: [id])
}
```

- [ ] **Step 2: Run migration**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx prisma migrate dev --name m7_disputes_payments_clientcontactid
```

The migration renames `clientId` → `clientContactId` and adds the FK. The dev DB has existing engagement rows where `clientId` stored `clientOrganization.id` (not a real FK — just a bare string). Since the dev DB is seeded/test data only, it's acceptable for the migration to fail if existing rows violate the FK; in that case, wipe the DB before migrating:

```bash
# Only if migration fails due to FK violation:
npx prisma migrate reset --force
npx prisma migrate dev --name m7_disputes_payments_clientcontactid
```

Expected output: `✓ Generated Prisma Client`

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: client generated to `app/generated/prisma/`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(m7): schema — Dispute, PaymentTransactionRecord, clientContactId FK"
```

---

## Task 2: Update engagement transitions and acceptEngagement dispute guard

**Files:**
- Modify: `modules/engagements/types.ts`
- Modify: `modules/engagements/service.ts`

- [ ] **Step 1: Add DISPUTED transitions to types.ts**

In `modules/engagements/types.ts`, the current `DISPUTED` entry is:

```ts
  DISPUTED: ['ACCEPTED', 'CANCELLED'],
```

Replace with:

```ts
  DISPUTED: ['ACCEPTED', 'REVISION_REQUESTED', 'CANCELLED'],
```

- [ ] **Step 2: Add dispute guard to acceptEngagement in service.ts**

In `modules/engagements/service.ts`, update `acceptEngagement` to also block when there is an open dispute:

```ts
export async function acceptEngagement(engagementId: string, actorId: string) {
  const latestDeliverable = await db.deliverable.findFirst({
    where: { engagementId },
    orderBy: { createdAt: 'desc' },
  })
  if (latestDeliverable?.aiQaRiskFlag) {
    const openTask = await db.adminTask.findFirst({
      where: { engagementId, deliverableId: latestDeliverable.id, resolved: false },
    })
    if (openTask) throw new Error('Acceptance blocked: AI QA risk flag requires admin review')
  }
  const openDispute = await db.dispute.findFirst({
    where: { engagementId, adminReviewStatus: { in: ['OPENED', 'UNDER_ADMIN_REVIEW', 'PROPOSED_RESOLUTION'] } },
  })
  if (openDispute) throw new Error('Acceptance blocked: open dispute must be resolved first')
  return transition(engagementId, 'ACCEPTED', 'accept', actorId, 'client')
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
git add modules/engagements/types.ts modules/engagements/service.ts
git commit -m "feat(m7): engagement transitions — DISPUTED→REVISION_REQUESTED, dispute guard on accept"
```

---

## Task 3: Disputes service module

**Files:**
- Create: `modules/disputes/service.ts`

- [ ] **Step 1: Write the failing tests** (Task 8 has the test file — write service first because tests import it)

Create `modules/disputes/service.ts`:

```ts
import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { callClaude } from '@/lib/ai'
import { ENGAGEMENT_TRANSITIONS } from '@/modules/engagements/types'

export async function openDispute(engagementId: string, openedBy: string, disputeReason: string) {
  return db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('DISPUTED')) {
      throw new Error(`Cannot open dispute: engagement is ${eng.status}`)
    }
    const dispute = await tx.dispute.create({
      data: { engagementId, openedBy, disputeReason, adminReviewStatus: 'OPENED' },
    })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'DISPUTED' } })
    await logEvent(tx, { entityType: 'Dispute', entityId: dispute.id, action: 'open', actorId: openedBy, actorRole: 'admin' })
    return dispute
  })
}

export async function generateAiDisputeSummary(disputeId: string, actorId: string) {
  const dispute = await db.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: {
      engagement: {
        include: {
          communications: { orderBy: { createdAt: 'asc' } },
          deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
          scope: true,
        },
      },
    },
  })

  const commsText = dispute.engagement.communications
    .map(c => `[${c.senderRole}/${c.messageType}] ${c.body}`)
    .join('\n')
  const latestDeliverable = dispute.engagement.deliverables[0]
  const deliverableText = latestDeliverable
    ? `Deliverable notes: ${latestDeliverable.consultantNotes ?? '(none)'}\nAI QA notes: ${latestDeliverable.aiQaNotes ?? '(none)'}`
    : 'No deliverable submitted.'

  const system = `You are an impartial dispute reviewer for a professional consulting platform.
Summarize the facts of this dispute in 2–4 sentences. Be factual and neutral. Do not recommend outcomes.`

  const prompt = `Dispute reason: ${dispute.disputeReason}

Engagement scope: ${dispute.engagement.scope.deliverable}
Acceptance criteria: ${dispute.engagement.scope.acceptanceCriteria}

${deliverableText}

Communication thread:
${commsText || '(no communications)'}`

  let summary = 'AI summary could not be generated. Manual review recommended.'
  try {
    summary = await callClaude(system, prompt)
  } catch {
    // fire-and-forget pattern — store fallback
  }

  await db.$transaction(async (tx: Tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { aiDisputeSummary: summary } })
    await tx.aIOutputLog.create({
      data: {
        touchpoint: 'dispute_summary',
        promptVersion: '1',
        model: 'claude-sonnet-4-6',
        inputSummary: `dispute:${disputeId}`,
        output: summary,
        exposed: false,
        reviewed: false,
      },
    })
    await logEvent(tx, { entityType: 'Dispute', entityId: disputeId, action: 'ai_summary', actorId, actorRole: 'admin' })
  })

  return summary
}

export async function resolveDispute(
  disputeId: string,
  proposedResolution: string,
  outcome: 'ACCEPTED' | 'REVISION_REQUESTED' | 'CANCELLED',
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } })
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: dispute.engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes(outcome)) {
      throw new Error(`Cannot resolve dispute: engagement ${eng.status} → ${outcome} is invalid`)
    }
    await tx.engagement.update({ where: { id: dispute.engagementId }, data: { status: outcome } })
    const resolved = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        proposedResolution,
        finalResolution: proposedResolution,
        resultingStatus: outcome,
        adminReviewStatus: 'CLOSED',
        closedAt: new Date(),
      },
    })
    await logEvent(tx, { entityType: 'Dispute', entityId: disputeId, action: `resolve_${outcome.toLowerCase()}`, actorId, actorRole: 'admin' })
    return resolved
  })
}

export async function listDisputes() {
  return db.dispute.findMany({
    where: { adminReviewStatus: { not: 'CLOSED' } },
    include: { engagement: { include: { project: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDispute(id: string) {
  return db.dispute.findUnique({
    where: { id },
    include: {
      engagement: {
        include: {
          project: true,
          scope: true,
          communications: { orderBy: { createdAt: 'asc' } },
          deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/disputes/service.ts
git commit -m "feat(m7): disputes service — openDispute, generateAiDisputeSummary, resolveDispute"
```

---

## Task 4: Payments service module

**Files:**
- Create: `modules/payments/service.ts`

- [ ] **Step 1: Create payments service**

```ts
import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { PaymentStatus, PayoutStatus } from '@/app/generated/prisma'

export async function createPaymentRecord(engagementId: string, amount: number, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const record = await tx.paymentTransactionRecord.create({
      data: { engagementId, amount },
    })
    await logEvent(tx, { entityType: 'PaymentTransactionRecord', entityId: record.id, action: 'create', actorId, actorRole: 'admin' })
    return record
  })
}

export async function updatePaymentStatus(
  engagementId: string,
  paymentStatus: PaymentStatus,
  payoutStatus: PayoutStatus,
  adminNotes: string | null,
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const record = await tx.paymentTransactionRecord.update({
      where: { engagementId },
      data: { paymentStatus, payoutStatus, adminNotes },
    })
    await logEvent(tx, { entityType: 'PaymentTransactionRecord', entityId: record.id, action: 'update_status', actorId, actorRole: 'admin' })
    return record
  })
}

export async function getPaymentRecord(engagementId: string) {
  return db.paymentTransactionRecord.findUnique({ where: { engagementId } })
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add modules/payments/service.ts
git commit -m "feat(m7): payments service — createPaymentRecord, updatePaymentStatus"
```

---

## Task 5: Wire up createEngagement and selectProposal

`Engagement.clientId` is gone. `selectProposal` passes `clientId: project.clientId` (org ID — wrong). It now needs `clientContactId` (the contact's ID for the acting user).

**Files:**
- Modify: `modules/proposals/service.ts`
- Modify: `modules/engagements/service.ts`

- [ ] **Step 1: Update selectProposal to look up clientContactId**

In `modules/proposals/service.ts`, update the `selectProposal` function. After loading `project`, add a lookup for `clientContactId`:

Replace this block:
```ts
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
```

With:
```ts
  // Load project and confirmed scope
  const project = await db.project.findUniqueOrThrow({ where: { id: invitation.projectId } })
  const scope = await db.scope.findFirstOrThrow({
    where: { projectId: invitation.projectId, status: 'CLIENT_CONFIRMED' },
  })

  // Look up the clientContactId for the actor (client who is selecting)
  // actorId is a User.id; find their ClientContact
  const clientContact = await db.clientContact.findFirst({ where: { userId: actorId } })
  // Fall back to first contact for the org if actor is not a client (e.g. admin selects in tests)
  const clientContactId = clientContact?.id
    ?? (await db.clientContact.findFirstOrThrow({ where: { organizationId: project.clientId } })).id

  // Create engagement
  await createEngagement(
    { projectId: invitation.projectId, scopeId: scope.id, proposalId, consultantId: proposal.consultantId, clientContactId },
    actorId
  )
```

- [ ] **Step 2: Update createEngagement signature and auto-create payment record**

In `modules/engagements/service.ts`:

Replace the `createEngagement` function signature and body. The `data` param changes `clientId` → `clientContactId`. Also auto-create the payment record using the scope fee.

```ts
export async function createEngagement(
  data: { projectId: string; scopeId: string; proposalId: string; consultantId: string; clientContactId: string },
  actorId: string
) {
  const engagement = await db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.create({ data })
    await logEvent(tx, { entityType: 'Engagement', entityId: eng.id, action: 'create', actorId, actorRole: 'admin' })
    return eng
  })
  await markEngagementCreated(data.projectId, actorId)

  // Auto-create payment record using scope fee
  const scope = await db.scope.findUniqueOrThrow({ where: { id: data.scopeId } })
  const { createPaymentRecord } = await import('@/modules/payments/service')
  await createPaymentRecord(engagement.id, Number(scope.fee), actorId)

  // Fire emails after transaction
  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagement.id },
    include: {
      consultant: { include: { user: true } },
      clientContact: { include: { user: true } },
      project: true,
    },
  })

  const clientContact = eng.clientContact

  await sendProposalSelectedEmail({
    consultantEmail: eng.consultant.user.email,
    consultantName: eng.consultant.user.email,
    projectTitle: eng.project.title,
    engagementId: eng.id,
  })

  if (clientContact) {
    await sendEngagementStartedEmail({
      clientEmail: clientContact.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.project.id,
    })
  }

  return engagement
}
```

Also update `closeEngagement` — it currently loads `project.client.contacts[0]` to get the client email. Update it to use `clientContact` directly:

```ts
export async function closeEngagement(engagementId: string, actorId: string) {
  const eng = await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })
  if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('CLOSED')) throw new Error(`Invalid transition: ${eng.status} → CLOSED`)

  await db.$transaction(async (tx: Tx) => {
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'CLOSED' } })
    await logEvent(tx, { entityType: 'Engagement', entityId: engagementId, action: 'close', actorId, actorRole: 'admin' })
  })

  await closeProject(eng.projectId, actorId)

  const full = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      consultant: { include: { user: true } },
      clientContact: true,
      project: true,
    },
  })

  if (full.clientContact) {
    await sendEngagementClosedEmail({
      email: full.clientContact.email,
      name: full.clientContact.name,
      projectTitle: full.project.title,
      engagementId,
      projectId: full.projectId,
      role: 'client',
    })
  }
  await sendEngagementClosedEmail({
    email: full.consultant.user.email,
    name: full.consultant.user.email,
    projectTitle: full.project.title,
    engagementId,
    projectId: full.projectId,
    role: 'consultant',
  })

  return full
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/proposals/service.ts modules/engagements/service.ts
git commit -m "feat(m7): wire clientContactId FK — selectProposal lookup, createEngagement, closeEngagement"
```

---

## Task 6: Update tests/setup.ts teardown order

**Files:**
- Modify: `tests/setup.ts`

- [ ] **Step 1: Add dispute and paymentTransactionRecord deletes in correct order**

Disputes and PaymentTransactionRecords depend on Engagement. Add them before the `engagement` delete:

```ts
afterEach(async () => {
  await prisma.adminTask.deleteMany()
  await prisma.aIOutputLog.deleteMany()
  await prisma.feedback.deleteMany()
  await prisma.revisionRequest.deleteMany()
  await prisma.deliverable.deleteMany()
  await prisma.engagementCommunication.deleteMany()
  await prisma.dispute.deleteMany()                     // NEW
  await prisma.paymentTransactionRecord.deleteMany()    // NEW
  await prisma.engagement.deleteMany()
  await prisma.proposal.deleteMany()
  await prisma.consultantInvitation.deleteMany()
  await prisma.shortlistCandidate.deleteMany()
  await prisma.shortlist.deleteMany()
  await prisma.scope.deleteMany()
  await prisma.project.deleteMany()
  await prisma.consultantRestriction.deleteMany()
  await prisma.consultantProfile.deleteMany()
  await prisma.clientContact.deleteMany()
  await prisma.clientOrganization.deleteMany()
  await prisma.eventLog.deleteMany()
  await prisma.legalAcceptanceRecord.deleteMany()
  await prisma.user.deleteMany()
})
```

- [ ] **Step 2: Commit**

```bash
git add tests/setup.ts
git commit -m "feat(m7): test teardown — add dispute and paymentTransactionRecord deletes"
```

---

## Task 7: Disputes tests

**Files:**
- Create: `tests/disputes.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'
import { startEngagement, acceptEngagement } from '@/modules/engagements/service'
import { submitDeliverable } from '@/modules/deliverables/service'
import { openDispute, resolveDispute, generateAiDisputeSummary } from '@/modules/disputes/service'

async function buildUnderReviewEngagement() {
  const admin = await upsertUser({ clerkId: 'disp_admin', email: 'admin@disp.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'disp_client', email: 'client@disp.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'disp_consultant', email: 'consultant@disp.test', role: 'consultant' })

  const org = await createOrganization({ name: 'Disp Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'Disp Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Report',
    acceptanceCriteria: 'Complete',
    assumptions: 'Data provided',
    exclusions: 'None',
    dueDate: new Date('2026-12-31'),
    fee: 1500,
    effortCapHours: 6,
  }, admin.id)
  await moveToAdminReview(scope.id, admin.id)
  await approveScope(scope.id, admin.id)
  await confirmScope(scope.id, admin.id)

  project = await markReadyForMatching(project.id, admin.id)
  project = await markMatchingInProgress(project.id, admin.id)

  const shortlist = await createShortlist(project.id, admin.id)
  const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
  await submitForAdminReview(shortlist.id, admin.id)
  await makeClientVisible(shortlist.id, admin.id)

  const invitation = await createInvitation({
    shortlistCandidateId: candidate.id,
    projectId: project.id,
    consultantId: profile.id,
    expiresAt: new Date('2026-12-31'),
  }, admin.id)
  await sendInvitation(invitation.id, admin.id)
  await acceptInterest(invitation.id, admin.id)

  const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Great fit.' }, admin.id)
  await selectProposal(proposal.id, admin.id)

  const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
  await startEngagement(engagement.id, admin.id)

  // Submit deliverable and move to UNDER_REVIEW
  const deliverable = await submitDeliverable(engagement.id, null, 'Work done.', admin.id)
  await prisma.deliverable.update({
    where: { id: deliverable.id },
    data: { aiQaRiskFlag: false, aiQaRunAt: new Date(), aiQaNotes: 'Looks good.' },
  })
  await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })

  const freshEng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
  return { admin, clientUser, profile, freshEng }
}

describe('M7 disputes', () => {
  it('openDispute transitions engagement to DISPUTED and creates Dispute record', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()

    const dispute = await openDispute(freshEng.id, admin.id, 'Deliverable does not meet criteria.')

    expect(dispute.adminReviewStatus).toBe('OPENED')
    expect(dispute.disputeReason).toBe('Deliverable does not meet criteria.')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('DISPUTED')

    const event = await prisma.eventLog.findFirst({ where: { entityType: 'Dispute', action: 'open' } })
    expect(event).not.toBeNull()
  })

  it('resolveDispute with ACCEPTED outcome transitions engagement to ACCEPTED and closes dispute', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Client unhappy.')

    const resolved = await resolveDispute(dispute.id, 'Reviewed and accepted as-is.', 'ACCEPTED', admin.id)

    expect(resolved.adminReviewStatus).toBe('CLOSED')
    expect(resolved.finalResolution).toBe('Reviewed and accepted as-is.')
    expect(resolved.resultingStatus).toBe('ACCEPTED')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('ACCEPTED')
  })

  it('resolveDispute with CANCELLED outcome transitions engagement to CANCELLED', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Fundamental scope disagreement.')

    await resolveDispute(dispute.id, 'Cannot reconcile. Cancelling.', 'CANCELLED', admin.id)

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('CANCELLED')
  })

  it('acceptEngagement is blocked while dispute is open', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    await openDispute(freshEng.id, admin.id, 'Issue flagged.')

    await expect(acceptEngagement(freshEng.id, admin.id)).rejects.toThrow('open dispute')
  })

  it('generateAiDisputeSummary writes to AIOutputLog with exposed: false', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Quality issue.')

    await generateAiDisputeSummary(dispute.id, admin.id)

    const updatedDispute = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(updatedDispute.aiDisputeSummary).toBeTruthy()

    const log = await prisma.aIOutputLog.findFirst({ where: { touchpoint: 'dispute_summary' } })
    expect(log).not.toBeNull()
    expect(log!.exposed).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail with correct errors before service exists (service already written in Task 3, so they should pass)**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npx vitest run tests/disputes.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/disputes.test.ts
git commit -m "test(m7): disputes — 5 tests: openDispute, resolveDispute, accept guard, AI summary"
```

---

## Task 8: Payments tests

**Files:**
- Create: `tests/payments.test.ts`

- [ ] **Step 1: Write the test file**

```ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'
import { updatePaymentStatus, getPaymentRecord } from '@/modules/payments/service'

async function buildEngagementWithPayment() {
  const admin = await upsertUser({ clerkId: 'pay_admin', email: 'admin@pay.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'pay_client', email: 'client@pay.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'pay_consultant', email: 'consultant@pay.test', role: 'consultant' })

  const org = await createOrganization({ name: 'Pay Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'Pay Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Report',
    acceptanceCriteria: 'Complete',
    assumptions: 'Data provided',
    exclusions: 'None',
    dueDate: new Date('2026-12-31'),
    fee: 2500,
    effortCapHours: 8,
  }, admin.id)
  await moveToAdminReview(scope.id, admin.id)
  await approveScope(scope.id, admin.id)
  await confirmScope(scope.id, admin.id)

  project = await markReadyForMatching(project.id, admin.id)
  project = await markMatchingInProgress(project.id, admin.id)

  const shortlist = await createShortlist(project.id, admin.id)
  const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
  await submitForAdminReview(shortlist.id, admin.id)
  await makeClientVisible(shortlist.id, admin.id)

  const invitation = await createInvitation({
    shortlistCandidateId: candidate.id,
    projectId: project.id,
    consultantId: profile.id,
    expiresAt: new Date('2026-12-31'),
  }, admin.id)
  await sendInvitation(invitation.id, admin.id)
  await acceptInterest(invitation.id, admin.id)

  const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Great fit.' }, admin.id)
  await selectProposal(proposal.id, admin.id)

  const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
  return { admin, clientUser, consultantUser, profile, engagement }
}

describe('M7 payments', () => {
  it('payment record is auto-created on engagement creation with scope fee as amount', async () => {
    const { engagement } = await buildEngagementWithPayment()

    const record = await getPaymentRecord(engagement.id)
    expect(record).not.toBeNull()
    expect(record!.amount.toString()).toBe('2500')
    expect(record!.paymentStatus).toBe('NOT_REQUIRED_YET')
    expect(record!.payoutStatus).toBe('PENDING')
  })

  it('updatePaymentStatus — admin can update payment and payout status with notes', async () => {
    const { admin, engagement } = await buildEngagementWithPayment()

    await updatePaymentStatus(engagement.id, 'AUTHORIZED', 'PENDING', 'Client authorized payment.', admin.id)

    const record = await getPaymentRecord(engagement.id)
    expect(record!.paymentStatus).toBe('AUTHORIZED')
    expect(record!.adminNotes).toBe('Client authorized payment.')

    const event = await prisma.eventLog.findFirst({
      where: { entityType: 'PaymentTransactionRecord', action: 'update_status' },
    })
    expect(event).not.toBeNull()
  })

  it('client field projection: platformFee is not included in client-facing select', async () => {
    const { clientUser, engagement } = await buildEngagementWithPayment()

    // Simulate what the client portal query does: select only amount and paymentStatus
    const record = await prisma.paymentTransactionRecord.findUnique({
      where: { engagementId: engagement.id },
      select: { amount: true, paymentStatus: true },
    })
    expect(record).not.toBeNull()
    expect(record!.amount).toBeDefined()
    expect((record as Record<string, unknown>)['platformFee']).toBeUndefined()
  })

  it('consultant field projection: amount and paymentStatus not in consultant-facing select', async () => {
    const { engagement } = await buildEngagementWithPayment()

    // Simulate what the consultant portal query does: select only payoutAmount and payoutStatus
    const record = await prisma.paymentTransactionRecord.findUnique({
      where: { engagementId: engagement.id },
      select: { payoutAmount: true, payoutStatus: true },
    })
    expect(record).not.toBeNull()
    expect((record as Record<string, unknown>)['amount']).toBeUndefined()
    expect((record as Record<string, unknown>)['paymentStatus']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/payments.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add tests/payments.test.ts
git commit -m "test(m7): payments — 4 tests: auto-create, updatePaymentStatus, field projections"
```

---

## Task 9: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm test
```

Expected: all tests pass (31 existing + 5 dispute + 4 payment = 40 tests). If spine test fails due to `clientContactId` change, debug there.

- [ ] **Step 2: Fix any failures**

Common failure: `spine.test.ts` — engagement is created with old `clientId` field. The spine test calls `selectProposal(proposal.id, admin.id)`. The actor is `admin.id` (a User with role `admin`, not a `ClientContact`). In Task 5 Step 1, the `selectProposal` fallback looks up the first contact for the org. Verify the spine test org has a contact record — it does (line 23: `await createContact(...)`). Should work.

- [ ] **Step 3: Commit if any fixes needed**

```bash
git add -p
git commit -m "fix(m7): spine test compatibility with clientContactId"
```

---

## Task 10: Admin UI — disputes list and detail pages

**Files:**
- Create: `app/(admin)/admin/disputes/page.tsx`
- Create: `app/(admin)/admin/disputes/[id]/page.tsx`
- Create: `app/(admin)/admin/disputes/actions.ts`

- [ ] **Step 1: Create disputes actions.ts**

```ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { openDispute, generateAiDisputeSummary, resolveDispute } from '@/modules/disputes/service'
import { updatePaymentStatus } from '@/modules/payments/service'
import type { PaymentStatus, PayoutStatus } from '@/app/generated/prisma'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function openDisputeAction(engagementId: string, formData: FormData) {
  const actor = await actorId()
  const disputeReason = formData.get('disputeReason') as string
  const dispute = await openDispute(engagementId, actor, disputeReason)
  redirect(`/admin/disputes/${dispute.id}`)
}

export async function generateAiDisputeSummaryAction(disputeId: string, engagementId: string) {
  await generateAiDisputeSummary(disputeId, await actorId())
  redirect(`/admin/disputes/${disputeId}`)
}

export async function resolveDisputeAction(disputeId: string, formData: FormData) {
  const actor = await actorId()
  const proposedResolution = formData.get('proposedResolution') as string
  const outcome = formData.get('outcome') as 'ACCEPTED' | 'REVISION_REQUESTED' | 'CANCELLED'
  await resolveDispute(disputeId, proposedResolution, outcome, actor)
  redirect(`/admin/disputes/${disputeId}`)
}

export async function updatePaymentStatusAction(engagementId: string, formData: FormData) {
  const actor = await actorId()
  const paymentStatus = formData.get('paymentStatus') as PaymentStatus
  const payoutStatus = formData.get('payoutStatus') as PayoutStatus
  const adminNotes = (formData.get('adminNotes') as string) || null
  await updatePaymentStatus(engagementId, paymentStatus, payoutStatus, adminNotes, actor)
  redirect(`/admin/engagements/${engagementId}`)
}
```

- [ ] **Step 2: Create disputes list page**

```tsx
import { listDisputes } from '@/modules/disputes/service'

export default async function DisputesListPage() {
  const disputes = await listDisputes()

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Open Disputes</h1>
      {disputes.length === 0 ? (
        <p className="text-sm text-slate-400">No open disputes.</p>
      ) : (
        <ul className="space-y-3">
          {disputes.map(d => (
            <li key={d.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">{d.engagement.project.title}</p>
                <p className="text-xs text-slate-500">{d.disputeReason}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{d.adminReviewStatus}</span>
                <a href={`/admin/disputes/${d.id}`} className="text-sm text-indigo-600 hover:underline">View →</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create dispute detail page**

```tsx
import { notFound } from 'next/navigation'
import { getDispute } from '@/modules/disputes/service'
import { generateAiDisputeSummaryAction, resolveDisputeAction } from '../actions'

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dispute = await getDispute(id)
  if (!dispute) notFound()

  const isClosed = dispute.adminReviewStatus === 'CLOSED'
  const engagement = dispute.engagement
  const latestDeliverable = engagement.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <a href="/admin/disputes" className="text-sm text-indigo-600 hover:underline">← Disputes</a>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dispute — {engagement.project.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Engagement: <a href={`/admin/engagements/${engagement.id}`} className="text-indigo-600 hover:underline">{engagement.id}</a></p>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{dispute.adminReviewStatus}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3 text-sm">
        <h2 className="font-semibold text-slate-700">Dispute Reason</h2>
        <p className="text-slate-700">{dispute.disputeReason}</p>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3 text-sm">
          <h2 className="font-semibold text-slate-700">Latest Deliverable</h2>
          {latestDeliverable.consultantNotes && (
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs font-medium text-slate-500 mb-1">Consultant notes</p>
              <p>{latestDeliverable.consultantNotes}</p>
            </div>
          )}
          {latestDeliverable.aiQaNotes && (
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-xs font-medium text-blue-600 mb-1">AI QA Notes</p>
              <p>{latestDeliverable.aiQaNotes}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Communications</h2>
        {engagement.communications.length === 0 ? (
          <p className="text-sm text-slate-400">No messages.</p>
        ) : (
          <ul className="space-y-3">
            {engagement.communications.map(m => (
              <li key={m.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{m.messageType}</span>
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs">{m.createdAt.toLocaleString()}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">AI Dispute Summary</h2>
          {!isClosed && (
            <form action={generateAiDisputeSummaryAction.bind(null, id, engagement.id)}>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Summarize Dispute</button>
            </form>
          )}
        </div>
        {dispute.aiDisputeSummary ? (
          <div className="p-3 bg-slate-50 rounded text-sm text-slate-700">{dispute.aiDisputeSummary}</div>
        ) : (
          <p className="text-sm text-slate-400">No AI summary yet. Click "Summarize Dispute" to generate one.</p>
        )}
      </div>

      {!isClosed && (
        <div className="bg-white rounded-lg border border-red-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Resolve Dispute</h2>
          <form action={resolveDisputeAction.bind(null, id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Proposed resolution</label>
              <textarea name="proposedResolution" required rows={3} className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outcome</label>
              <select name="outcome" required className="text-sm border border-slate-300 rounded px-3 py-2">
                <option value="ACCEPTED">Accept deliverable</option>
                <option value="REVISION_REQUESTED">Request revision</option>
                <option value="CANCELLED">Cancel engagement</option>
              </select>
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Resolve Dispute</button>
          </form>
        </div>
      )}

      {isClosed && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-sm text-green-700">
          Dispute closed. Outcome: <span className="font-medium">{dispute.resultingStatus}</span>.
          <p className="mt-1 text-green-600">{dispute.finalResolution}</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/(admin)/admin/disputes/
git commit -m "feat(m7): admin disputes UI — list page, detail page with AI summary + resolve form"
```

---

## Task 11: Admin engagement detail — Open Dispute button and Payment panel

**Files:**
- Modify: `app/(admin)/admin/engagements/[id]/page.tsx`
- Modify: `app/(admin)/admin/engagements/actions.ts`

- [ ] **Step 1: Update engagement detail page**

In `app/(admin)/admin/engagements/[id]/page.tsx`, add these two queries after the existing `openAdminTask` query:

```ts
  const dispute = await db.dispute.findUnique({ where: { engagementId: id } })
  const paymentRecord = await db.paymentTransactionRecord.findUnique({ where: { engagementId: id } })
```

Also add the `openDisputeAction` and `updatePaymentStatusAction` imports at the top:

```ts
import { startEngagementAction, beginReviewAction, acceptEngagementAction, closeEngagementAction, cancelEngagementAction, resolveAdminTaskAction, updateRevisionRequestAction, sendMessageAction } from '../actions'
import { openDisputeAction } from '../../disputes/actions'
import { updatePaymentStatusAction } from '../../disputes/actions'
```

Combine into one import:

```ts
import { openDisputeAction, updatePaymentStatusAction } from '../../disputes/actions'
```

Add the dispute panel after the openRevision block (before the Actions block):

```tsx
      {dispute && (
        <div className="bg-white rounded-lg border border-red-200 p-6 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-700">Dispute</h2>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{dispute.adminReviewStatus}</span>
              <a href={`/admin/disputes/${dispute.id}`} className="text-xs text-indigo-600 hover:underline">View dispute →</a>
            </div>
          </div>
          <p className="text-slate-600">{dispute.disputeReason}</p>
          {dispute.aiDisputeSummary && (
            <div className="p-3 bg-slate-50 rounded text-xs text-slate-700">{dispute.aiDisputeSummary}</div>
          )}
        </div>
      )}
```

Add the "Open Dispute" button in the Actions block (after the Cancel button logic):

```tsx
          {!dispute && (allowed.includes('DISPUTED') || engagement.status === 'UNDER_REVIEW' || engagement.status === 'ACCEPTED') && engagement.status !== 'CLOSED' && engagement.status !== 'CANCELLED' && (
            <form action={openDisputeAction.bind(null, id)} className="flex items-center gap-2">
              <input name="disputeReason" required placeholder="Dispute reason…" className="text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-500 w-64" />
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Open Dispute</button>
            </form>
          )}
```

Add the payment panel after the dispute panel:

```tsx
      {paymentRecord && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Payment</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-slate-500">Amount</p><p className="font-medium">${paymentRecord.amount.toString()}</p></div>
            <div><p className="text-slate-500">Platform fee</p><p className="font-medium">{paymentRecord.platformFee ? `$${paymentRecord.platformFee.toString()}` : '—'}</p></div>
            <div><p className="text-slate-500">Payout amount</p><p className="font-medium">{paymentRecord.payoutAmount ? `$${paymentRecord.payoutAmount.toString()}` : '—'}</p></div>
            <div><p className="text-slate-500">Payment status</p><p className="font-medium">{paymentRecord.paymentStatus}</p></div>
            <div><p className="text-slate-500">Payout status</p><p className="font-medium">{paymentRecord.payoutStatus}</p></div>
            <div><p className="text-slate-500">Due date</p><p className="font-medium">{paymentRecord.paymentDueDate?.toLocaleDateString() ?? '—'}</p></div>
            {paymentRecord.adminNotes && <div className="col-span-2"><p className="text-slate-500">Notes</p><p>{paymentRecord.adminNotes}</p></div>}
          </div>
          <form action={updatePaymentStatusAction.bind(null, id)} className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Update Status</h3>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Payment status</label>
                <select name="paymentStatus" defaultValue={paymentRecord.paymentStatus} className="text-sm border border-slate-300 rounded px-2 py-1">
                  {['NOT_REQUIRED_YET','AUTHORIZATION_PENDING','AUTHORIZED','PAYMENT_FAILED','PAYMENT_CONFIRMED','RELEASE_PENDING','RELEASED','REFUNDED','DISPUTED'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Payout status</label>
                <select name="payoutStatus" defaultValue={paymentRecord.payoutStatus} className="text-sm border border-slate-300 rounded px-2 py-1">
                  {['PENDING','RELEASE_PENDING','RELEASED','ON_HOLD','REFUNDED'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Admin notes</label>
              <input name="adminNotes" defaultValue={paymentRecord.adminNotes ?? ''} className="text-sm border border-slate-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Update Payment</button>
          </form>
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(admin)/admin/engagements/[id]/page.tsx"
git commit -m "feat(m7): admin engagement detail — Open Dispute button and payment panel"
```

---

## Task 12: Admin layout — add Disputes nav link

**Files:**
- Modify: `app/(admin)/layout.tsx`

- [ ] **Step 1: Add Disputes link under Engagements**

In `app/(admin)/layout.tsx`, add after the Engagements link:

```tsx
          <a href="/admin/disputes" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Disputes</a>
```

- [ ] **Step 2: Commit**

```bash
git add "app/(admin)/layout.tsx"
git commit -m "feat(m7): admin nav — add Disputes link"
```

---

## Task 13: Client portal — payment status card

**Files:**
- Modify: `app/(client)/projects/[id]/engagement/[engagementId]/page.tsx`

- [ ] **Step 1: Update client engagement page**

The existing query uses `clientId: contact.organizationId`. After the `clientContactId` migration, this field is gone. Update the query where clause:

Change:
```ts
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, clientId: contact.organizationId },
```

To:
```ts
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, clientContactId: contact.id },
```

Add `paymentRecord` to the include:
```ts
    include: {
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      project: true,
      feedbacks: { where: { submittedBy: user.id } },
      paymentRecord: { select: { amount: true, paymentStatus: true } },
    },
```

Add payment status card after the scope card and before the deliverable card:

```tsx
      {engagement.paymentRecord && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2 text-sm">
          <h2 className="font-semibold text-slate-700">Payment</h2>
          <div className="flex gap-6">
            <div><p className="text-slate-500">Amount</p><p className="font-medium">${engagement.paymentRecord.amount.toString()}</p></div>
            <div><p className="text-slate-500">Status</p><p className="font-medium">{engagement.paymentRecord.paymentStatus}</p></div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(client)/projects/[id]/engagement/[engagementId]/page.tsx"
git commit -m "feat(m7): client engagement — payment status card (amount + paymentStatus)"
```

---

## Task 14: Consultant portal — payout status card

**Files:**
- Modify: `app/(consultant)/engagements/[id]/page.tsx`

- [ ] **Step 1: Add paymentRecord to consultant engagement query**

Add `paymentRecord` to the include with consultant-facing fields only:

```ts
    include: {
      project: true,
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      revisionRequests: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 1 },
      feedbacks: { where: { submittedBy: user.id } },
      paymentRecord: { select: { payoutAmount: true, payoutStatus: true } },
    },
```

Add payout status card after the scope card:

```tsx
      {engagement.paymentRecord && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2 text-sm">
          <h2 className="font-semibold text-slate-700">Payout</h2>
          <div className="flex gap-6">
            <div><p className="text-slate-500">Payout amount</p><p className="font-medium">{engagement.paymentRecord.payoutAmount ? `$${engagement.paymentRecord.payoutAmount.toString()}` : 'TBD'}</p></div>
            <div><p className="text-slate-500">Status</p><p className="font-medium">{engagement.paymentRecord.payoutStatus}</p></div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run all tests to confirm 40/40**

```bash
npm test
```

Expected: 40 tests pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(consultant)/engagements/[id]/page.tsx"
git commit -m "feat(m7): consultant engagement — payout status card (payoutAmount + payoutStatus)"
```

---

## Task 15: Update HANDOFF.md

**Files:**
- Modify: `HANDOFF.md`

- [ ] **Step 1: Update milestone status table**

Change M7 row from `🔄 In Progress` to `✅ Complete`.

Update test count to 40/40.

Add M7 to "What's Working" section: dispute flow (openDispute, AI summary, resolve with 3 outcomes), payment record auto-creation, admin dispute UI, payment panels in all three portals.

Add M7 schema additions to "Schema Additions" section.

- [ ] **Step 2: Commit**

```bash
git add HANDOFF.md
git commit -m "docs: update HANDOFF.md — M7 complete, 40/40 tests"
```

---

## Self-Review

**Spec coverage check:**

| Spec item | Task |
|-----------|------|
| Dispute model expand | Task 1 |
| DisputeStatus/PaymentStatus/PayoutStatus enums | Task 1 |
| PaymentTransactionRecord model | Task 1 |
| clientContactId FK migration | Task 1, 5 |
| DISPUTED → REVISION_REQUESTED transition | Task 2 |
| Dispute guard on acceptEngagement | Task 2 |
| openDispute service | Task 3 |
| generateAiDisputeSummary (AIOutputLog, exposed: false) | Task 3 |
| resolveDispute (3 outcomes) | Task 3 |
| createPaymentRecord (auto on engagement create) | Task 4, 5 |
| updatePaymentStatus | Task 4 |
| Setup teardown order (dispute, paymentRecord) | Task 6 |
| Dispute tests (5 cases) | Task 7 |
| Payment tests (4 cases) | Task 8 |
| Admin disputes list page | Task 10 |
| Admin dispute detail (comms, AI summary, resolve) | Task 10 |
| Admin dispute server actions | Task 10 |
| Admin engagement: Open Dispute button | Task 11 |
| Admin engagement: payment panel + update form | Task 11 |
| Admin nav: Disputes link | Task 12 |
| Client portal: payment status card | Task 13 |
| Consultant portal: payout status card | Task 14 |
| HANDOFF.md update | Task 15 |

**No placeholders found.**

**Type consistency:** `clientContactId` consistently used across Tasks 1, 5, 13. `PaymentStatus`/`PayoutStatus`/`DisputeStatus` imported from `@/app/generated/prisma` in Tasks 4, 10. `createPaymentRecord` takes `(engagementId, amount, actorId)` — called that way in Task 5. `resolveDispute` takes `(disputeId, proposedResolution, outcome, actorId)` — matches call sites in Tasks 3, 10.
