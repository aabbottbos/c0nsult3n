# M2 — Client & Consultant Portals

**Date:** 2026-07-23  
**Status:** Approved — ready for implementation  
**Scope:** Client portal (full end-to-end), consultant portal (full end-to-end), role assignment on sign-up, AI-assisted scoping + match rationale  

---

## 1. Goal

Give real clients and consultants self-service access to the product. After M2, a founder can onboard an actual client (who submits a project, reviews scope, selects a consultant, and accepts a deliverable) and an actual consultant (who receives an invitation, submits a proposal, and delivers work) — all without the founder acting as a proxy through the admin UI.

---

## 2. Approach

Sequential portal build: client portal first, then consultant portal. Both portals live in the same Next.js app, same Neon DB, same Clerk auth instance. Role assignment happens at sign-up via a two-step Clerk flow + webhook. Two AI touchpoints are wired in M2 (scope drafting, match rationale), both gated on admin approval before any user sees output. Email notifications are deferred to M3.

---

## 3. Route Structure

### Client portal — `app/(client)/`

```
app/(client)/
  layout.tsx                  # requireRole('client'); project-centric sidebar
  projects/
    page.tsx                  # list all client's projects with status + action callouts
    new/
      page.tsx                # project intake form
    [id]/
      page.tsx                # project detail — stage-aware: shows scope review, shortlist, engagement, or deliverable review depending on project status
    actions.ts                # submitProject, confirmScope, requestScopeChanges, selectProposal, acceptDeliverable, requestRevision
  engagements/
    [id]/
      page.tsx                # engagement detail + message thread (read only for client)
```

### Consultant portal — `app/(consultant)/`

```
app/(consultant)/
  layout.tsx                  # requireRole('consultant'); inbox-style sidebar
  invitations/
    page.tsx                  # inbox: pending invitations with countdown + fee preview
    [id]/
      page.tsx                # invitation detail: full scope + proposal form (fit statement)
    actions.ts                # submitProposal, declineInvitation
  engagements/
    page.tsx                  # active engagements list with status badges
    [id]/
      page.tsx                # engagement detail: scope reminder + deliverable submit + messages
    actions.ts                # submitDeliverable
```

---

## 4. Layout Design

### Client sidebar — project-centric

- Projects listed by name in the sidebar
- Active project highlighted; badge shown if action is needed ("Scope ready", "Shortlist ready", "Deliverable submitted")
- "New Project" button at top
- Account / Settings link at bottom
- `layout.tsx` fetches the client's projects server-side and passes to a client sidebar component

### Consultant sidebar — inbox-style

- Two primary nav items: **Invitations** (with badge count of pending) and **Active Engagements**
- Past Work link at bottom
- Profile / Account link at bottom
- `layout.tsx` fetches invitation count server-side for the badge

---

## 5. Client Portal — Page Designs

### `/projects` — My Projects

- Lists all projects belonging to the client's `ClientOrganization`
- Each row shows: project title, current status badge, and a short action callout when attention is needed ("Scope ready for review →", "Shortlist ready — select a consultant →", "Deliverable submitted — review now →")
- "Action needed" projects sorted to top, highlighted with indigo left border
- "+ New Project" button leads to `/projects/new`

### `/projects/new` — New Project

- Simple intake form: title, description
- On submit: calls `createProject` service, transitions to `DRAFT`, redirects to `/projects/[id]`
- A Server Action then immediately calls `submitProject` to move to `SUBMITTED` (clients don't sit in DRAFT)

### `/projects/[id]` — Project Detail (stage-aware)

Single page that renders differently based on `project.status`:

| Status | What client sees |
|--------|-----------------|
| `SUBMITTED` / `UNDER_ADMIN_REVIEW` / `NEEDS_CLARIFICATION` | "We're reviewing your project" holding state with status message |
| `SCOPE_APPROVED` | Scope review card: deliverable, fee, cap, due date, acceptance criteria. Confirm or Request Changes buttons. |
| `CLIENT_CONFIRMED` / `READY_FOR_MATCHING` / `MATCHING_IN_PROGRESS` | "We're finding your consultant" holding state |
| `SHORTLIST_READY` | Shortlist: consultant cards with admin-approved rationale, proposal status per candidate. "Select this consultant" button per candidate (only enabled once their proposal is `SUBMITTED`). Triggers `selectProposal` action. |
| `ENGAGEMENT_CREATED` / active engagement | Engagement card: consultant name, status, deliverable state, messages link |
| `CLOSED` | Closed summary |
| `CANCELLED` | Cancelled notice |

### `/engagements/[id]` — Engagement Detail

- Shows scope summary, current status, deliverable (if submitted), message thread
- "Accept Deliverable" and "Request Revision" buttons when status is `UNDER_REVIEW`
- Messages: read-only list of `EngagementCommunication` records (typed messages, not free chat)

---

## 6. Consultant Portal — Page Designs

### `/invitations` — Invitations Inbox

- Lists all `ConsultantInvitation` records for the consultant where status is `SENT`, `VIEWED`, or `QUESTIONS_ASKED`
- Each card: project type/category, fee, effort cap, due date, days remaining to respond (urgency color: red < 5 days, amber < 10 days)
- "View & Respond" button per invitation

### `/invitations/[id]` — Invitation Detail + Proposal

- Full scope: deliverable, acceptance criteria, assumptions, exclusions, fee, cap, due date
- Fit statement textarea (required to submit)
- Submit Proposal / Decline buttons
- `submitProposal` action: creates `Proposal` with status `SUBMITTED`, transitions invitation to `PROPOSAL_SUBMITTED`
- `declineInvitation` action: transitions invitation to `DECLINED`

### `/engagements` — Active Engagements

- Lists engagements where the consultant is assigned and status is not `CLOSED` or `CANCELLED`
- Status badges: In Progress, Deliverable Submitted, Under Review, Revision Requested, Disputed
- "Submit Deliverable" button inline for `IN_PROGRESS` engagements

### `/engagements/[id]` — Engagement Detail

- Scope reminder (deliverable, fee, cap, due date)
- Deliverable submission: URL/link field (no file upload in M2 — URL only) + notes textarea
- `submitDeliverable` action: creates `Deliverable` record with `fileUrl` set to the submitted URL, transitions engagement to `DELIVERABLE_SUBMITTED`
- Message thread: `EngagementCommunication` records for this engagement, read-only list

---

## 7. Role Assignment on Sign-Up

### Sign-up flow changes

Replace the current `<SignUp>` Clerk component with a two-step custom flow in `/sign-up/[[...sign-up]]/page.tsx`:

1. **Step 1:** Email + password (standard Clerk `<SignUp>` with `routing="hash"` for the initial step)
2. **Step 2:** Role selector — "I'm hiring a consultant" → `client`, "I'm a consultant" → `consultant`  
   Sets `unsafeMetadata: { role: 'client' | 'consultant' }` via `clerk.client.signUp.update()` before completing sign-up

### Webhook handler (`/api/webhooks/clerk`)

Add `user.created` case:

1. Read `event.data.unsafe_metadata.role`
2. Validate it is `'client'` or `'consultant'` — reject/ignore anything else (`admin` cannot be self-assigned)
3. Call `clerkClient.users.updateUserMetadata(userId, { publicMetadata: { role } })` to promote to `publicMetadata`
4. Create DB record:
   - `client` → create `ClientOrganization` (name = user's email domain for now) + `ClientContact` (userId, name, email)
   - `consultant` → create `ConsultantProfile` (userId, approvalStatus: `pending`, accountStatus: `active`, publicationStatus: `draft`)

### Post-sign-in redirects

Update `proxy.ts` to redirect after sign-in based on role:
- `admin` → `/dashboard` (existing)
- `client` → `/projects`
- `consultant` → `/invitations`

---

## 8. AI Integration

### Touchpoint 1 — Scope drafting

**Where:** Admin project detail page (`/projects/[id]`) — new "Draft Scope with AI" button, visible when `project.status === 'UNDER_ADMIN_REVIEW'` and no scope exists yet.

**What it does:**
1. Server Action `draftScopeWithAI(projectId)` calls `requireRole('admin')`
2. Fetches project title + description + relevant Scoping Matrix rows (seeded in `.claude/skills/scoping-matrix/`)
3. Calls Anthropic API (Claude) with a prompt that produces structured JSON: `{ deliverable, acceptanceCriteria, assumptions, exclusions, feeEstimate, effortCapHours, dueDateSuggestion }`
4. Creates a `Scope` record with status `AI_DRAFTED`, all fields populated from the response
5. Logs to `AIOutputLog`: touchpoint `scope_draft`, promptVersion constant, input summary, raw output, `exposed: false`, `reviewed: false`
6. Redirects admin to `/scopes/[id]` to review and edit

**Gate:** Admin must move scope through `ADMIN_REVIEW` → `ADMIN_APPROVED` before client sees it. Existing scope state machine enforces this — no changes needed.

### Touchpoint 2 — Match rationale

**Where:** Admin shortlist detail page (`/shortlists/[id]`) — new "Generate Match Rationale" button, visible when shortlist status is `ADMIN_REVIEW` or `CLIENT_VISIBLE`.

**What it does:**
1. Server Action `generateMatchRationale(shortlistId)` calls `requireRole('admin')`
2. Fetches scope + each `ShortlistCandidate`'s `ConsultantProfile`
3. Calls Claude with scope + profiles, produces a 2–3 sentence client-facing rationale per candidate explaining fit
4. Writes rationale to `ShortlistCandidate.rationale` (new nullable `String` field on the model)
5. Logs to `AIOutputLog`: touchpoint `match_rationale`, promptVersion constant, `exposed: false`, `reviewed: false`
6. Admin reviews/edits rationale inline on the shortlist detail page before marking shortlist `CLIENT_VISIBLE`

**Gate:** Rationale only surfaces to clients once shortlist status is `CLIENT_VISIBLE`. Client shortlist page renders `candidate.rationale` if present.

### Anthropic SDK setup

- Install `@anthropic-ai/sdk`
- `ANTHROPIC_API_KEY` in `.env.local`
- Thin `lib/ai.ts` wrapper: `callClaude(prompt: string, system: string): Promise<string>` — single function, no streaming, no abstraction beyond what's needed for these two calls
- Model: `claude-sonnet-4-6` (current default per environment)

---

## 9. Data Model Changes

One new field, no new tables:

- `ShortlistCandidate.rationale String?` — nullable, written by AI + admin-edited, rendered to client when shortlist is `CLIENT_VISIBLE`

Migration: `npx prisma migrate dev --name add-shortlist-candidate-rationale`

---

## 10. Auth & Permission Rules

### Client portal
- `requireRole('client')` in `app/(client)/layout.tsx` — all pages inside are protected
- Every service call filters by the client's `ClientOrganization.id` (fetched from `ClientContact` via `userId`)
- Clients never see: internal scores, admin notes, unapproved AI rationale, other clients' data, consultant contact details beyond what's on their proposal

### Consultant portal
- `requireRole('consultant')` in `app/(consultant)/layout.tsx`
- Invitations filtered to `ConsultantInvitation.consultantId === profile.id`
- Engagements filtered to `Engagement.consultantProfileId === profile.id`
- Consultants never see: other proposals, shortlist scores, competing consultants on the same shortlist

### Server Actions
- Every `actions.ts` file in both portals calls `requireRole(...)` as the first line — layout guards do not protect direct action invocations

---

## 11. Testing

- Integration test: client sign-up → project submit → admin drafts scope with AI (mocked Anthropic call) → admin approves → client confirms → admin builds shortlist + generates rationale → admin marks visible → client views shortlist → admin sends invitation → consultant submits proposal → admin selects → engagement starts → consultant submits deliverable → client accepts
- Permission tests: client cannot access consultant routes and vice versa; consultant cannot see another consultant's invitation
- Role webhook test: `user.created` with valid role creates correct DB record; `user.created` with `role: 'admin'` is ignored

---

## 12. Out of Scope for M2

- Email notifications (M3)
- File upload for deliverables (URL/link only in M2)
- Stripe payments (M3+)
- Vercel production deploy (M3)
- Consultant profile editing UI (consultants cannot edit their own profile in M2 — admin manages profiles)
- Client organization management (multi-contact orgs, M3+)
- Remove `/debug` page (before any real user exposure — do before first real user onboards)
