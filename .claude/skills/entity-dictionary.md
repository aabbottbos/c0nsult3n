# Entity Dictionary

> Field-level reference for every model in `prisma/schema.prisma`. Source of truth when SPEC.md and code diverge: fix the spec first, then the code.

---

## Auth & People

### User
**Purpose:** One row per authenticated human; bridges Clerk identity to app roles.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | Internal PK |
| clerkId | String (unique) | Clerk user ID — must match `auth().userId` |
| email | String (unique) | Email address |
| role | Role enum | `admin` \| `client` \| `consultant` — single role per user |
| createdAt / updatedAt | DateTime | Audit timestamps |

**Relations:** has one `ClientContact?`, has one `ConsultantProfile?`, has many `EventLog`, has many `LegalAcceptanceRecord`.

**Notes:** Role is lowercase (`admin`, `client`, `consultant`). Read from `sessionClaims.metadata.role` in `lib/auth.ts`. A user is either a client contact or a consultant profile, never both.

---

### ClientOrganization
**Purpose:** Buying company; the billing and project-owning entity.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| name | String | Org display name |
| status | ClientOrgStatus | `active` \| `inactive` |

**Relations:** has many `ClientContact`, has many `Project`.

---

### ClientContact
**Purpose:** Individual user within a ClientOrganization who interacts with the platform.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| userId | String (unique) | FK → User |
| organizationId | String | FK → ClientOrganization |
| name | String | Display name |
| email | String | Contact email |

**Relations:** belongs to `User`, belongs to `ClientOrganization`.

**Notes:** `userId` is unique so one User maps to exactly one ClientContact.

---

### ConsultantProfile
**Purpose:** Consultant-specific data; carries the three independent status dimensions.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| userId | String (unique) | FK → User |
| approvalStatus | ApprovalStatus | `pending` \| `approved` \| `rejected` — did Consulten vet and approve this person? |
| accountStatus | AccountStatus | `active` \| `suspended` \| `deactivated` — is the account operational? |
| publicationStatus | PublicationStatus | `draft` \| `published` \| `unpublished` — is the profile visible to matching? |

**Relations:** belongs to `User`, has many `ConsultantRestriction`, has many `ShortlistCandidate`, has many `ConsultantInvitation`, has many `Proposal`, has many `Engagement`.

**Three separate statuses — do not collapse:**
- `approvalStatus` = Consulten has verified and accepted this consultant (onboarding gate).
- `accountStatus` = account is operationally active (runtime gate; suspension is temporary, deactivation is permanent).
- `publicationStatus` = profile is surfaced for matching (visibility gate; a consultant can be approved + active but hidden).
- A consultant eligible for a new invitation must be `approvalStatus=approved`, `accountStatus=active`, `publicationStatus=published` with no active blocking restrictions. All three are checked independently.

---

### ConsultantRestriction
**Purpose:** Records a time-bounded restriction on a consultant's ability to work (conflict of interest, exclusivity, availability block, etc.).

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| consultantId | String | FK → ConsultantProfile |
| type | String | Restriction category (e.g. "conflict_of_interest", "unavailable") |
| notes | String? | Admin notes on the restriction |
| activeFrom | DateTime | When restriction begins |
| activeTo | DateTime? | When restriction ends (null = indefinite) |

**Relations:** belongs to `ConsultantProfile`.

**Notes:** `modules/restrictions/service.ts isEligible()` queries active restrictions to block or flag during matching.

---

## Project Spine

### Project
**Purpose:** The original client-expressed need; the top-level work unit that flows through the entire lifecycle.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| clientId | String | FK → ClientOrganization |
| status | ProjectStatus | See state-machine skill |
| title | String | Short project title |
| description | String | Detailed description from client |

**Relations:** belongs to `ClientOrganization`, has one `Scope?`, has one `Shortlist?`, has many `Engagement`, has many `ConsultantInvitation`.

---

### Scope
**Purpose:** Admin-approved, fixed-scope work definition derived from the project intake. One per project.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| projectId | String (unique) | FK → Project |
| status | ScopeStatus | See state-machine skill |
| deliverable | String | What the consultant will produce |
| acceptanceCriteria | String | How the client accepts the deliverable |
| assumptions | String | What is assumed true (nullable in practice — render with `?? ''`) |
| exclusions | String | What is explicitly out of scope (nullable in practice — render with `?? ''`) |
| dueDate | DateTime | When deliverable is due |
| fee | Decimal(10,2) | Fixed fee; Prisma returns as `Decimal` object — call `.toString()` before rendering |
| effortCapHours | Int | Max hours for the engagement (~10 hour cap) |

**Relations:** belongs to `Project`, has many `Engagement`.

**Notes:** Must be `ADMIN_APPROVED` before the project can advance to matching. Final scope is a gated AI output — see ai-gates skill.

---

### Shortlist
**Purpose:** The admin-curated list of candidate consultants for a project.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| projectId | String (unique) | FK → Project |
| status | ShortlistStatus | See state-machine skill |

**Relations:** belongs to `Project`, has many `ShortlistCandidate`.

**Notes:** Must reach `CLIENT_VISIBLE` before clients can see it. Client-facing match rationale is a gated AI output.

---

### ShortlistCandidate
**Purpose:** Join record placing one ConsultantProfile on one Shortlist.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| shortlistId | String | FK → Shortlist |
| consultantId | String | FK → ConsultantProfile |
| addedBy | String | Admin user ID who added this candidate |

**Relations:** belongs to `Shortlist`, belongs to `ConsultantProfile`, has many `ConsultantInvitation`.

**Notes:** A consultant CANNOT be invited until a ShortlistCandidate row exists. `createInvitation` in `modules/invitations/service.ts` validates `shortlistCandidateId`.

---

### ConsultantInvitation
**Purpose:** Admin-issued invitation to a shortlisted consultant to respond to a project.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| shortlistCandidateId | String | FK → ShortlistCandidate (proves shortlist membership) |
| projectId | String | FK → Project |
| consultantId | String | FK → ConsultantProfile |
| status | InvitationStatus | See state-machine skill |
| sentAt | DateTime? | When invitation was dispatched |
| expiresAt | DateTime? | Auto-expiry timestamp |

**Relations:** belongs to `ShortlistCandidate`, belongs to `Project`, belongs to `ConsultantProfile`, has many `Proposal`.

---

### Proposal
**Purpose:** Consultant's response to an invitation — fit statement and any scope deviations.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| invitationId | String | FK → ConsultantInvitation |
| consultantId | String | FK → ConsultantProfile |
| status | ProposalStatus | See state-machine skill |
| fitStatement | String | Consultant's free-text fit explanation |
| deviations | Json | Structured record of any proposed scope changes (default `{}`) |

**Relations:** belongs to `ConsultantInvitation`, belongs to `ConsultantProfile`, has many `Engagement`.

---

### Engagement
**Purpose:** Active work record created when a proposal is selected. Ties together project, scope, proposal, consultant, and client.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| projectId | String | FK → Project |
| scopeId | String | FK → Scope |
| proposalId | String | FK → Proposal |
| consultantId | String | FK → ConsultantProfile |
| clientId | String | FK → ClientOrganization (denormalized for query convenience) |
| status | EngagementStatus | See state-machine skill |

**Relations:** belongs to `Project`, `Scope`, `Proposal`, `ConsultantProfile`; has many `Deliverable`, `RevisionRequest`, `EngagementCommunication`.

---

### Deliverable
**Purpose:** A single submission artifact within an engagement.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| engagementId | String | FK → Engagement |
| status | DeliverableStatus | `PENDING` \| `SUBMITTED` \| `ACCEPTED` \| `REVISION_REQUESTED` |
| submittedAt | DateTime? | When the consultant submitted |
| fileUrl | String? | Link to artifact (MVP B: S3-backed) |

**Relations:** belongs to `Engagement`, has many `RevisionRequest`.

---

### RevisionRequest
**Purpose:** Client or admin request for changes to a submitted deliverable.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| engagementId | String | FK → Engagement |
| deliverableId | String | FK → Deliverable |
| requestedBy | String | Actor user ID |
| reason | String | Explanation of requested revision |
| status | RevisionRequestStatus | `OPEN` → `ADDRESSED` or `WITHDRAWN` |

**Relations:** belongs to `Engagement`, belongs to `Deliverable`.

---

### EngagementCommunication
**Purpose:** Structured, typed message within an engagement (not open chat).

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| engagementId | String | FK → Engagement (indexed) |
| senderId | String | Actor user ID |
| senderRole | Role | Role at send time |
| messageType | String | Workflow-tied type tag (e.g. "question", "status_update") |
| body | String | Message content |

**Relations:** belongs to `Engagement`.

**Notes:** Indexed on `engagementId` for list queries. Not open chat — `messageType` must be set.

---

## Cross-cutting

### AIOutputLog
**Purpose:** Immutable log of every AI call; gated outputs must be reviewed before exposure. See ai-gates skill.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| touchpoint | String | Which AI feature produced this output |
| promptVersion | String | Version tag of the prompt used |
| model | String | AI model identifier |
| inputSummary | String | Redacted summary of input (not full PII) |
| output | String | AI-generated output |
| exposed | Boolean | Has this been shown to a user? Default false |
| reviewed | Boolean | Has an admin approved it? Default false |
| decision | String? | Admin's approval/rejection note |
| timestamp | DateTime | When the AI call was made |

**Notes:** Gated rule: `reviewed` must be `true` before `exposed` is set to `true`. Never expose gated outputs without admin review.

---

### EventLog
**Purpose:** Append-only audit log for all entity state changes and admin actions.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| entityType | String | Which model was affected (e.g. "Project") |
| entityId | String | PK of the affected record |
| action | String | What happened (e.g. "status_changed", "invited") |
| actorId | String | FK → User who took the action |
| actorRole | Role | Role at time of action |
| data | Json | Contextual payload (before/after state, etc.) Default `{}` |
| timestamp | DateTime | When the event occurred |

**Relations:** belongs to `User` (actor).

**Notes:** Never deleted. Used by admin detail pages (read via `lib/db.ts` in Server Components).

---

### LegalAcceptanceRecord
**Purpose:** Immutable record of a user accepting a legal document.

| Field | Type | Meaning |
|-------|------|---------|
| id | String (cuid) | PK |
| userId | String | FK → User |
| documentType | String | Which document (e.g. "terms_of_service", "nda") |
| version | String | Document version string |
| acceptedAt | DateTime | When acceptance was recorded |
| ipAddress | String | IP at time of acceptance (PII — admin-restricted) |

**Relations:** belongs to `User`.

**Notes:** Immutable once created. Admin-restricted; never expose `ipAddress` to non-admins.

---

## Stubs (present in schema, empty in M1)

### Dispute
**Purpose:** Issue escalation and admin resolution. Stub only — fields TBD in M7.

### Notification
**Purpose:** System-generated notifications to users. Stub only — fields TBD in M6.

### AdminTask
**Purpose:** Admin work queue items. Stub only — fields TBD.

### ScopingMatrixClassification
**Purpose:** Links a project to a Scoping Matrix row (specialization → deliverable pattern). Stub only — fields TBD in M2.

---

## Enum quick-reference

| Enum | Values |
|------|--------|
| Role | `admin`, `client`, `consultant` |
| ClientOrgStatus | `active`, `inactive` |
| ApprovalStatus | `pending`, `approved`, `rejected` |
| AccountStatus | `active`, `suspended`, `deactivated` |
| PublicationStatus | `draft`, `published`, `unpublished` |
| ProjectStatus | `DRAFT`, `SUBMITTED`, `UNDER_ADMIN_REVIEW`, `NEEDS_CLARIFICATION`, `SCOPE_APPROVED`, `READY_FOR_MATCHING`, `MATCHING_IN_PROGRESS`, `SHORTLIST_READY`, `ENGAGEMENT_CREATED`, `CLOSED`, `CANCELLED` |
| ScopeStatus | `NOT_STARTED`, `AI_DRAFTED`, `ADMIN_REVIEW`, `ADMIN_APPROVED`, `CLIENT_CHANGE_REQUESTED`, `CLIENT_CONFIRMED`, `REJECTED` |
| ShortlistStatus | `DRAFT`, `ADMIN_REVIEW`, `CLIENT_VISIBLE`, `UPDATED`, `CLOSED` |
| InvitationStatus | `DRAFT`, `SENT`, `VIEWED`, `ACCEPTED_INTEREST`, `DECLINED`, `QUESTIONS_ASKED`, `PROPOSAL_SUBMITTED`, `EXPIRED`, `WITHDRAWN` |
| ProposalStatus | `DRAFT`, `SUBMITTED`, `SELECTED`, `REJECTED` |
| EngagementStatus | `PENDING_START`, `IN_PROGRESS`, `DELIVERABLE_SUBMITTED`, `UNDER_REVIEW`, `REVISION_REQUESTED`, `DISPUTED`, `ACCEPTED`, `CLOSED`, `CANCELLED` |
| DeliverableStatus | `PENDING`, `SUBMITTED`, `ACCEPTED`, `REVISION_REQUESTED` |
| RevisionRequestStatus | `OPEN`, `ADDRESSED`, `WITHDRAWN` |
