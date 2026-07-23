# State Machine

> Authoritative transition maps for every entity status in the system. Source files: `modules/*/types.ts`.

---

## Core rule

**Users take actions; the system records the resulting state.** No service function accepts a raw target status from user input. Transitions are validated against the `*_TRANSITIONS` map in each module's `types.ts` before any DB write. Any attempt to set a status directly (bypassing the transition guard) must be rejected.

---

## ProjectStatus (`modules/projects/types.ts`)

**States:** `DRAFT` · `SUBMITTED` · `UNDER_ADMIN_REVIEW` · `NEEDS_CLARIFICATION` · `SCOPE_APPROVED` · `READY_FOR_MATCHING` · `MATCHING_IN_PROGRESS` · `SHORTLIST_READY` · `ENGAGEMENT_CREATED` · `CLOSED` · `CANCELLED`

**Transitions:**

```
DRAFT               → SUBMITTED               (client submits project)
DRAFT               → CANCELLED               (client cancels before submit)
SUBMITTED           → UNDER_ADMIN_REVIEW      (admin picks up project)
SUBMITTED           → CANCELLED
UNDER_ADMIN_REVIEW  → SCOPE_APPROVED          (admin approves scope definition)
UNDER_ADMIN_REVIEW  → NEEDS_CLARIFICATION     (admin requests more info)
UNDER_ADMIN_REVIEW  → CANCELLED
NEEDS_CLARIFICATION → SUBMITTED               (client resubmits after clarifying)
NEEDS_CLARIFICATION → CANCELLED
SCOPE_APPROVED      → READY_FOR_MATCHING      (admin triggers matching)
SCOPE_APPROVED      → CANCELLED
READY_FOR_MATCHING  → MATCHING_IN_PROGRESS    (system starts matching run)
READY_FOR_MATCHING  → CANCELLED
MATCHING_IN_PROGRESS → SHORTLIST_READY        (shortlist finalized by admin)
MATCHING_IN_PROGRESS → CANCELLED
SHORTLIST_READY     → ENGAGEMENT_CREATED      (client selects consultant)
SHORTLIST_READY     → CANCELLED
ENGAGEMENT_CREATED  → CLOSED                  (engagement completes)
ENGAGEMENT_CREATED  → CANCELLED
CLOSED              → (terminal)
CANCELLED           → (terminal)
```

---

## ScopeStatus (`modules/scopes/types.ts`)

**States:** `NOT_STARTED` · `AI_DRAFTED` · `ADMIN_REVIEW` · `ADMIN_APPROVED` · `CLIENT_CHANGE_REQUESTED` · `CLIENT_CONFIRMED` · `REJECTED`

**Transitions:**

```
NOT_STARTED           → AI_DRAFTED             (AI generates scope draft)
AI_DRAFTED            → ADMIN_REVIEW           (admin queues for review)
ADMIN_REVIEW          → ADMIN_APPROVED         (admin approves)
ADMIN_REVIEW          → CLIENT_CHANGE_REQUESTED (admin requests client input)
ADMIN_REVIEW          → REJECTED               (admin rejects)
ADMIN_APPROVED        → CLIENT_CONFIRMED       (client confirms)
ADMIN_APPROVED        → CLIENT_CHANGE_REQUESTED (client requests changes)
CLIENT_CHANGE_REQUESTED → ADMIN_REVIEW         (admin re-reviews after changes)
CLIENT_CONFIRMED      → (terminal)
REJECTED              → (terminal)
```

**Notes:**
- `AI_DRAFTED` scope is a gated AI output — must be `ADMIN_APPROVED` before client can see it.
- Project cannot advance to `SCOPE_APPROVED` / `READY_FOR_MATCHING` until scope is `ADMIN_APPROVED`.

---

## ShortlistStatus (`modules/shortlists/types.ts`)

**States:** `DRAFT` · `ADMIN_REVIEW` · `CLIENT_VISIBLE` · `UPDATED` · `CLOSED`

**Transitions:**

```
DRAFT        → ADMIN_REVIEW    (admin submits for review)
DRAFT        → CLOSED          (admin closes without publishing)
ADMIN_REVIEW → CLIENT_VISIBLE  (admin approves; client can now see shortlist)
ADMIN_REVIEW → DRAFT           (admin sends back for revision)
CLIENT_VISIBLE → UPDATED       (admin updates after initial publication)
CLIENT_VISIBLE → CLOSED
UPDATED      → CLIENT_VISIBLE  (admin republishes after update)
UPDATED      → CLOSED
CLOSED       → (terminal)
```

**Notes:** Client-facing match rationale is a gated AI output — must be admin-approved before `CLIENT_VISIBLE`.

---

## InvitationStatus (`modules/invitations/types.ts`)

**States:** `DRAFT` · `SENT` · `VIEWED` · `ACCEPTED_INTEREST` · `DECLINED` · `QUESTIONS_ASKED` · `PROPOSAL_SUBMITTED` · `EXPIRED` · `WITHDRAWN`

**Transitions:**

```
DRAFT             → SENT               (admin sends invitation)
DRAFT             → WITHDRAWN
SENT              → VIEWED             (consultant views)
SENT              → ACCEPTED_INTEREST  (consultant skips to accept)
SENT              → EXPIRED            (deadline passed)
SENT              → WITHDRAWN          (admin withdraws)
VIEWED            → ACCEPTED_INTEREST  (consultant accepts interest)
VIEWED            → DECLINED           (consultant declines)
VIEWED            → QUESTIONS_ASKED    (consultant asks questions)
ACCEPTED_INTEREST → PROPOSAL_SUBMITTED (consultant submits proposal)
ACCEPTED_INTEREST → WITHDRAWN
DECLINED          → (terminal)
QUESTIONS_ASKED   → ACCEPTED_INTEREST  (after Q&A resolved)
QUESTIONS_ASKED   → DECLINED
PROPOSAL_SUBMITTED → (terminal)
EXPIRED           → (terminal)
WITHDRAWN         → (terminal)
```

**Notes:** Invitation can only be created if a `ShortlistCandidate` row exists for the consultant + shortlist. Suspended / deactivated / unpublished consultants cannot receive new invitations.

---

## ProposalStatus (`modules/proposals/types.ts`)

**States:** `DRAFT` · `SUBMITTED` · `SELECTED` · `REJECTED`

**Transitions:**

```
DRAFT     → SUBMITTED  (consultant submits)
SUBMITTED → SELECTED   (admin/client selects this proposal)
SUBMITTED → REJECTED   (admin/client rejects)
SELECTED  → (terminal)
REJECTED  → (terminal)
```

**Notes:** Selection triggers Engagement creation. Only one proposal per project can be `SELECTED`.

---

## EngagementStatus (`modules/engagements/types.ts`)

**States:** `PENDING_START` · `IN_PROGRESS` · `DELIVERABLE_SUBMITTED` · `UNDER_REVIEW` · `REVISION_REQUESTED` · `DISPUTED` · `ACCEPTED` · `CLOSED` · `CANCELLED`

**Transitions:**

```
PENDING_START        → IN_PROGRESS            (consultant starts work)
PENDING_START        → CANCELLED
IN_PROGRESS          → DELIVERABLE_SUBMITTED  (consultant submits deliverable)
IN_PROGRESS          → CANCELLED
DELIVERABLE_SUBMITTED → UNDER_REVIEW          (system/admin picks up for QA)
UNDER_REVIEW         → REVISION_REQUESTED     (admin/client requests revision)
UNDER_REVIEW         → DISPUTED               (dispute raised)
UNDER_REVIEW         → ACCEPTED               (deliverable accepted)
REVISION_REQUESTED   → IN_PROGRESS            (consultant addresses revision)
REVISION_REQUESTED   → CANCELLED
DISPUTED             → ACCEPTED               (dispute resolved in favor of acceptance)
DISPUTED             → CANCELLED              (dispute resolved; engagement cancelled)
ACCEPTED             → CLOSED                 (admin closes out)
CLOSED               → (terminal)
CANCELLED            → (terminal)
```

---

## DeliverableStatus (`modules/deliverables/types.ts`)

**States:** `PENDING` · `SUBMITTED` · `ACCEPTED` · `REVISION_REQUESTED`

No transition map implemented yet (enum only in `types.ts`). Expected transitions:
```
PENDING            → SUBMITTED          (consultant submits)
SUBMITTED          → ACCEPTED           (client/admin accepts)
SUBMITTED          → REVISION_REQUESTED (revision requested)
REVISION_REQUESTED → SUBMITTED          (consultant resubmits)
```

---

## RevisionRequestStatus

**States:** `OPEN` · `ADDRESSED` · `WITHDRAWN`

No separate `types.ts` transition map — transitions are applied directly in `modules/deliverables/service.ts`:

```
OPEN → ADDRESSED   (consultant marks revision addressed)
OPEN → WITHDRAWN   (requester withdraws the request)
```

`ADDRESSED` and `WITHDRAWN` are terminal.
