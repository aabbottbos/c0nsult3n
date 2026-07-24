# M4 — Matching, Shortlist, Invitations Design

**Goal:** Stub matching pipeline + admin shortlist curation + invitation management. Produces a client-visible shortlist with admin-approved rationale from a rules-based eligibility filter and AI fit assessment.

**Architecture:** Modular monolith — new `modules/matching/` does eligibility filtering and AI assessment; existing `modules/shortlists/` and `modules/invitations/` handle curation and dispatch. Admin curates manually; no auto-population of shortlist from matching output.

**Tech Stack:** Next.js 16 App Router, Prisma 7, Neon Postgres, Clerk auth, Anthropic SDK (`claude-sonnet-4-6`), existing `lib/ai.ts` wrapper.

---

## What we're building

A stub matching pipeline + admin shortlist curation + invitation management flow. Three phases:

1. **Eligibility filter (deterministic):** query `ConsultantProfile` for `approvalStatus=approved`, `accountStatus=active`, `publicationStatus=published`; call `isEligible()` to exclude active restrictions. No specialization/skill/fee filtering (profile fields not yet available).
2. **Baseline score (stub):** all eligible candidates score `0`. No ranking logic yet.
3. **AI fit assessment:** calls Claude with project scope + eligible consultant IDs. Returns fit tier (`HIGH`/`MEDIUM`/`LOW`) + short rationale per candidate. Writes to `AIOutputLog`. Admin reviews and manually adds selected candidates to the shortlist.

Admin workflow: "Run Matching" on project detail (status `READY_FOR_MATCHING`) → matching workspace shows eligible candidates with AI tiers → admin adds to shortlist → admin generates client-facing rationale (existing) → admin approves and makes client-visible.

---

## Schema changes

### `ShortlistCandidate` — new nullable fields

```prisma
model ShortlistCandidate {
  // existing fields unchanged
  filterReason       String?
  baselineScore      Int?
  aiFitTier          String?   // HIGH | MEDIUM | LOW
  aiFitScore         Int?
  aiFitRationale     String?   // internal; never exposed to client
  aiRiskFlags        String?   // internal; never exposed to client
  adminApprovalStatus String?
  clientVisibleStatus String?
}
```

All fields nullable — stub pipeline won't populate most of them. Existing `rationale String?` field remains for client-facing copy (populated by the existing "Generate Match Rationale" AI action).

No new models required.

---

## New module: `modules/matching/`

### `modules/matching/service.ts`

```typescript
export async function runMatching(projectId: string, actorId: string): Promise<{
  eligible: ConsultantProfile[]
  aiAssessments: { consultantId: string; tier: string; rationale: string }[]
}>
```

- Loads project + scope (throws if no scope or scope not `CLIENT_CONFIRMED`/`ADMIN_APPROVED`)
- Queries all `ConsultantProfile` with `approvalStatus=approved`, `accountStatus=active`, `publicationStatus=published`
- Runs `isEligible()` from `modules/restrictions/service` on each; excludes ineligible
- Calls Claude with scope + eligible profiles; parses JSON response into `aiAssessments`
- Creates a `Shortlist` record (status `DRAFT`) if one doesn't already exist for this project
- Writes one `AIOutputLog` row (touchpoint: `matching_assessment`, `exposed: false`, `reviewed: false`)
- Logs event to `EventLog` (action: `run_matching`)
- Returns `{ eligible, aiAssessments, shortlistId }` — does NOT write to `ShortlistCandidate`

---

## New surfaces

### Admin matching workspace — `/admin/projects/[id]/matching`

New page. Loaded when project status is `READY_FOR_MATCHING` or `MATCHING_IN_PROGRESS`.

- "Run Matching" button → calls `runMatchingAction` → displays results inline (eligible candidates + AI tier)
- Per-candidate row: consultant ID, AI tier badge, AI rationale (internal), "Add to Shortlist" button
- "Add to Shortlist" → calls `addCandidateAction(shortlistId, consultantId)` → creates `ShortlistCandidate`, stores `aiFitTier` and `aiFitRationale` on it
- Link from admin project detail page (status `READY_FOR_MATCHING`): "Run Matching →"

### Admin shortlist detail — `/shortlists/[id]` (existing, extended)

- Add "Create & Send Invitation" button on each candidate row (visible when shortlist status is `ADMIN_REVIEW` or `CLIENT_VISIBLE`)
- Calls `createAndSendInvitationAction(shortlistCandidateId, projectId, consultantId, expiresAt)`

### Client project detail — `/projects/[id]` (existing)

Already shows shortlist when `SHORTLIST_READY`. Exposes `rationale` only. Never exposes `aiFitTier`, `aiFitScore`, `aiFitRationale`, `aiRiskFlags`, `filterReason`, or `baselineScore`.

### Consultant invitation detail — `/invitations/[id]` (existing)

No changes needed.

---

## New server actions

### `app/(admin)/admin/projects/[id]/matching/actions.ts`

```typescript
export async function runMatchingAction(projectId: string): Promise<MatchingResult>
export async function addCandidateAction(shortlistId: string, consultantId: string, aiFitTier: string | null, aiFitRationale: string | null): Promise<void>
```

### `app/(admin)/shortlists/actions.ts` (extended)

```typescript
export async function createAndSendInvitationAction(
  shortlistCandidateId: string,
  projectId: string,
  consultantId: string,
  expiresAt: Date
): Promise<void>
```

Calls `createInvitation()` then `sendInvitation()` from `modules/invitations/service`.

---

## Permissions

| Actor | Can see | Cannot see |
|-------|---------|------------|
| Admin | Full matching workspace, all candidate fields, AI tiers, risk flags, internal rationale | — |
| Client | Shortlist with `rationale` only | `aiFitTier`, `aiFitScore`, `aiFitRationale`, `aiRiskFlags`, `filterReason`, `baselineScore`, admin notes |
| Consultant | Own invitation only | Everything else |

Enforcement: client shortlist query never selects the restricted fields. Server Actions call `requireRole()` before any mutation.

---

## Tests

Located in `tests/matching.test.ts`:

1. `runMatching` excludes consultants with active restrictions
2. `runMatching` excludes consultants with `approvalStatus != approved` or `accountStatus != active` or `publicationStatus != published`
3. `addCandidate` stores `aiFitTier` and `aiFitRationale` on the created `ShortlistCandidate`
4. `createInvitation` fails if `shortlistCandidateId` does not exist (FK enforcement + explicit check)
5. Client shortlist response never includes `aiFitTier`, `aiFitScore`, `aiRiskFlags`, `filterReason` (query-level assertion)

---

## What's deferred

- Baseline score weighting (needs consultant skill/specialization fields on profile)
- Specialization/skill/fee eligibility filters (same dependency)
- Admin approval status / client-visible status per candidate (fields added to schema, logic deferred to M5 polish)
- "Invitation Expiring" cron job (no cron infrastructure yet)
