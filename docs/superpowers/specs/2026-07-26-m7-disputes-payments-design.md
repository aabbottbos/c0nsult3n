# M7 Design — Disputes & Payment Status

**Date:** 2026-07-26  
**Scope:** Minimal viable M7 — Dispute flow + Payment status tracking. No cron, no hardening sprint.

---

## 1. Disputes

### Goal
Close the dead-end `DISPUTED` engagement state. Client can flag an issue; admin escalates to a formal dispute; admin resolves it; engagement reaches a terminal state.

### Flow

1. **Issue flag (existing):** Client sends an `ISSUE_FLAG` `EngagementCommunication`. Already implemented in M6.
2. **Escalate to dispute (new):** Admin clicks "Open Dispute" on the admin engagement detail. This:
   - Creates a `Dispute` record (status `OPENED`)
   - Transitions engagement → `DISPUTED`
   - Logs to `EventLog`
3. **AI dispute summary (new, admin-only):** Admin can trigger "Summarize Dispute" — calls Claude with the engagement comms + deliverable notes, returns a factual summary. Written to `AIOutputLog` (`exposed: false`). Displayed only on the admin dispute detail. Never shown to client or consultant.
4. **Admin resolution (new):** Admin sets `proposedResolution` text and selects an outcome:
   - **Accept** → engagement → `ACCEPTED`
   - **Revision** → engagement → `REVISION_REQUESTED`
   - **Cancel** → engagement → `CANCELLED`
   - Dispute status → `RESOLVED` → `CLOSED`
   - Logs to `EventLog`

### Schema changes

Expand the stub `Dispute` model:

```prisma
model Dispute {
  id                 String        @id @default(cuid())
  engagementId       String        @unique
  openedBy           String        // userId
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

enum DisputeStatus {
  OPENED
  UNDER_ADMIN_REVIEW
  PROPOSED_RESOLUTION
  RESOLVED
  CLOSED
}
```

Add `disputes Dispute[]` relation to `Engagement`.

### Service: `modules/disputes/service.ts`

- `openDispute(engagementId, openedBy, disputeReason)` — creates Dispute, transitions engagement to `DISPUTED`, logs event
- `generateAiDisputeSummary(disputeId, actorId)` — calls Claude, updates `aiDisputeSummary`, writes `AIOutputLog`
- `resolveDispute(disputeId, proposedResolution, outcome, actorId)` — sets resolution fields, transitions engagement to outcome state, closes dispute, logs event

### Engagement state machine
`DISPUTED` transitions (currently missing) added to `ENGAGEMENT_TRANSITIONS` in `modules/engagements/types.ts`:
- `DISPUTED → ACCEPTED` (dispute resolved: accept)
- `DISPUTED → REVISION_REQUESTED` (dispute resolved: revise)
- `DISPUTED → CANCELLED` (dispute resolved: cancel)

### Admin surfaces
- **Admin engagement detail** (existing `app/(admin)/admin/engagements/[id]/page.tsx`): add "Open Dispute" button when status is `UNDER_REVIEW` or `ACCEPTED` (pre-close); add dispute panel showing status + AI summary + resolve form when dispute exists.
- **Admin dispute detail** (new `app/(admin)/admin/disputes/[id]/page.tsx`): standalone dispute page with full comms context, AI summary trigger, resolve form.
- **Admin disputes list** (new `app/(admin)/admin/disputes/page.tsx`): list of open disputes.

### Permissions
- Admin only: open dispute, generate AI summary, resolve dispute.
- Client/consultant: cannot see `aiDisputeSummary`, `adminReviewStatus`, `proposedResolution` (internal fields). They see engagement status (`DISPUTED`) and can continue using structured comms.
- Engagement cannot reach `ACCEPTED`/`CLOSED` while dispute is `OPENED`/`UNDER_ADMIN_REVIEW`/`PROPOSED_RESOLUTION` — enforced in `acceptEngagement` service guard.

---

## 2. Payment Status

### Goal
Admin manually confirms and tracks payment/payout status. All three portals show the relevant status fields. No provider webhooks in MVP A.

### Schema changes

Expand `Engagement` with `clientContactId` FK (surgical fix — currently stores `clientId` as bare string):

```prisma
model Engagement {
  // ... existing fields ...
  clientContactId String   // replaces bare clientId string

  clientContact ClientContact @relation(fields: [clientContactId], references: [id])
}
```

New `PaymentTransactionRecord`:

```prisma
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

model PaymentTransactionRecord {
  id              String        @id @default(cuid())
  engagementId    String        @unique
  amount          Decimal       @db.Decimal(10, 2)
  platformFee     Decimal?      @db.Decimal(10, 2)
  payoutAmount    Decimal?      @db.Decimal(10, 2)
  paymentStatus   PaymentStatus @default(NOT_REQUIRED_YET)
  payoutStatus    PayoutStatus  @default(PENDING)
  paymentDueDate  DateTime?
  adminNotes      String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  engagement Engagement @relation(fields: [engagementId], references: [id])
}
```

Add `paymentRecord PaymentTransactionRecord?` relation to `Engagement`.

### Service: `modules/payments/service.ts`

- `createPaymentRecord(engagementId, amount, actorId)` — creates record, logs event. Called automatically when engagement is created (in `selectProposal` service, using scope fee).
- `updatePaymentStatus(engagementId, paymentStatus, payoutStatus, adminNotes, actorId)` — admin-only update, logs event.

### Admin surfaces
- **Admin engagement detail**: add payment panel showing all fields; "Update Payment Status" form (status dropdowns + adminNotes textarea).

### Client portal surfaces
- **Client engagement detail** (`app/(client)/projects/[id]/engagement/[engagementId]/page.tsx`): add read-only payment status card showing `amount`, `paymentStatus`. No payout fields.

### Consultant portal surfaces
- **Consultant engagement detail** (`app/(engagements)/engagements/[id]/page.tsx`): add read-only payout status card showing `payoutAmount`, `payoutStatus`. No payment/fee fields.

### Permissions
- Client: sees `amount` + `paymentStatus` only.
- Consultant: sees `payoutAmount` + `payoutStatus` only.
- Admin: sees all fields, can update.
- `platformFee` is admin-only — never exposed to client or consultant.

---

## 3. Engagement `clientContactId` Migration

The `Engagement.clientId` field is currently a bare `String` (not a FK). This is the surgical fix:

1. Add migration: rename `clientId` → `clientContactId`, add FK to `ClientContact`. The dev DB has existing `Engagement` rows; the migration must either backfill or drop+recreate the column. Since this is a dev/test DB with seed data only, a destructive migration (drop column, add nullable FK, backfill from project → client contact, set NOT NULL) is acceptable — no production data at risk.
2. Update `selectProposal` in `modules/proposals/service.ts` to pass `clientContactId` (the acting user's `ClientContact.id` — look up by `userId` on `ClientContact`).
3. Update all service reads that reference `engagement.clientId`.
4. Update `tests/setup.ts` teardown (no change needed — teardown uses `engagementId`-based deletes).

---

## 4. Tests

New test file: `tests/disputes.test.ts`
- `openDispute` transitions engagement to `DISPUTED`
- `resolveDispute` with accept outcome → `ACCEPTED`
- `resolveDispute` with cancel outcome → `CANCELLED`
- Engagement cannot be accepted while dispute is open (guard test)
- AI summary writes to `AIOutputLog` and is not `exposed`

New test file: `tests/payments.test.ts`
- `createPaymentRecord` auto-created on engagement creation
- `updatePaymentStatus` — admin can update; logs event
- Client field projection: `platformFee` never returned in client-facing query
- Consultant field projection: `amount`/`paymentStatus` never returned in consultant-facing query

---

## 5. What's NOT in M7

- No cron / "Revision Due Soon" notifications
- No hardening sprint (permission test sweep, admin queue surfaces, EventLog audit)
- No Stripe webhooks or provider integration
- No client-facing dispute UI (clients see engagement status change; admin owns dispute workflow)
- No `ConsultantPayoutSetup` expansion
