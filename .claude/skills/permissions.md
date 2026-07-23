# Permissions

> Role model and permission invariants for Consulten. Source: SPEC.md §6.3, lib/auth.ts, modules/*/service.ts.

---

## Role model

Three roles, all lowercase: `admin` · `client` · `consultant`

- Stored in Clerk `publicMetadata.role`
- Read via `sessionClaims.metadata.role` in `lib/auth.ts`
- A User has exactly one role — never multiple
- Role values in the DB and all `requireRole()` calls must be lowercase; the Prisma enum is `admin | client | consultant`

### Role capabilities (summary)

| Role | Can do |
|------|--------|
| `admin` | Full read/write on all entities; approve gated AI outputs; invite consultants; approve shortlists; override statuses (logged); act on behalf of other users (audited) |
| `client` | Submit and view own projects; view admin-approved shortlists and rationale; confirm scope; select from shortlist; review deliverables |
| `consultant` | View only projects they are invited to or assigned to; submit proposals; submit deliverables |

---

## Auth enforcement layers

1. **Clerk middleware** (`middleware.ts`) — `auth.protect()` blocks unauthenticated requests at the edge.
2. **`requireRole(role)`** (`lib/auth.ts`) — called in admin layout (`app/(admin)/layout.tsx`) and in every `actions.ts` file. Returns `notFound()` on mismatch.
3. **Service-layer guards** — business rules enforced in `modules/*/service.ts` (e.g. shortlist membership check before invitation).
4. **State machine transition guards** — `*_TRANSITIONS` maps block invalid status changes.
5. **EventLog** — all admin overrides and status changes are recorded for audit.

**Critical:** The admin layout guard does NOT protect direct Server Action invocations. Every `actions.ts` file must independently call `requireRole('admin')` — layout guards are bypass-able via direct POST.

---

## Permission invariants

### 1. Users see only authorized records
**Rule:** No record crosses a role boundary without an explicit authorization check.
**Enforced by:** Clerk middleware (unauthenticated), `requireRole()` in admin layout + every `actions.ts`, service-layer ownership checks.
**Status:** Enforced for admin surfaces. Client/consultant read surfaces not yet built (M1 has no client or consultant UI).

---

### 2. Clients never see internal or unapproved data
**Rule:** Clients see only:
- Projects they own
- Admin-approved shortlists (`ShortlistStatus = CLIENT_VISIBLE`)
- Admin-approved scope (`ScopeStatus = ADMIN_APPROVED` or `CLIENT_CONFIRMED`)
- Approved AI rationale (`AIOutputLog.reviewed = true` and `exposed = true`)

**Clients must never see:** internal scores, admin notes, unapproved AI rationale, other clients' data.
**Enforced by:** Service layer (queries filtered by clientId), AI gate (reviewed flag). Client UI not yet built — enforce on build.

---

### 3. Consultant must be on the shortlist before being invited
**Rule:** A `ConsultantInvitation` cannot be created unless a `ShortlistCandidate` row exists for that consultant on that project's shortlist.
**Enforced by:** `modules/invitations/service.ts` `createInvitation()` validates `shortlistCandidateId` and checks it belongs to the correct shortlist/consultant pair.
**Status:** Enforced.

---

### 4. Consultants see only invited or assigned projects
**Rule:** A consultant must never see a project they were not invited to (via `ConsultantInvitation`) or assigned to (via `Engagement`).
**Enforced by:** Not yet enforced — consultant UI does not exist in M1. Must be enforced in service-layer queries when consultant-facing pages are built in M4/M5.
**Status:** NOT YET ENFORCED (no consultant UI).

---

### 5. Active restrictions exclude or flag consultant during matching
**Rule:** A consultant with an active `ConsultantRestriction` (where `activeFrom <= now` and (`activeTo IS NULL` or `activeTo > now`)) must be excluded from or flagged in matching results. Suspended / deactivated / unpublished consultants cannot receive new invitations.
**Enforced by:** `modules/restrictions/service.ts isEligible()` — returns `{ eligible: boolean, reason?: string }`. Called during matching eligibility filter.
**Status:** `isEligible()` implemented. Full matching module (M4) not built yet.

---

### 6. Standard users cannot edit raw statuses; admin overrides are logged
**Rule:** No user-facing action accepts a raw target status. All status changes go through transition guards (`*_TRANSITIONS` maps). Admin overrides are allowed but must write an `EventLog` record.
**Enforced by:** State machine transition guards in service layers; `EventLog` writes on every admin state change.
**Status:** Enforced for all implemented services. EventLog is populated on state changes.

---

## What is NOT yet enforced (build list)

| Invariant | When to enforce |
|-----------|----------------|
| Consultant sees only invited/assigned projects | M4 (matching) / M5 (proposals) — when consultant UI is built |
| Client reads are filtered to owned projects | M2/M5 — when client-facing project pages are built |
| AI rationale exposed only after `reviewed=true` | M6 — when AI QA features are built |
| `ipAddress` in `LegalAcceptanceRecord` is admin-restricted | Any milestone that exposes this record |

---

## PII rules

- `LegalAcceptanceRecord.ipAddress` — admin-restricted, never expose to non-admins.
- Verification artifacts — admin-restricted, stored securely (MVP B: S3 with access control).
- No payment-card data or raw bank details in any product record.
- AI `inputSummary` in `AIOutputLog` must be a redacted summary, not raw PII.
