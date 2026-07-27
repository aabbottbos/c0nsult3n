# MVP A Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining MVP A hardening gaps: one missing permission test, an admin work queue, CI env improvement, and environment separation notes.

**Architecture:** All changes are additive — a new test file, a new admin page, and CI config edits. No schema changes. No new modules.

**Tech Stack:** Next.js App Router (Server Components), Prisma 7, Vitest, GitHub Actions.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `tests/permissions.test.ts` | Create | Permission invariant: raw status set rejected |
| `app/(admin)/admin/queue/page.tsx` | Create | Unified admin work queue |
| `app/(admin)/layout.tsx` | Modify | Add Queue nav link |
| `.github/workflows/ci.yml` | Modify | Add `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN` to CI env (needed for build) |

---

### Task 1: Permission test — raw status set is rejected

The spec §6.3 invariant "standard users cannot set raw statuses" is untested. Every module enforces transitions via a `TRANSITIONS` map that throws on invalid moves. We test that a state transition service throws when bypassed with an invalid direct status call.

**Files:**
- Create: `tests/permissions.test.ts`
- Test: `tests/permissions.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/permissions.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'
import { startEngagement } from '@/modules/engagements/service'

describe('Permission invariants — raw status bypass rejected', () => {
  it('scope service rejects invalid transition (e.g. ADMIN_REVIEW → CLIENT_CONFIRMED skipping ADMIN_APPROVED)', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_1', email: 'admin@perm.test', role: 'admin' })
    const org = await createOrganization({ name: 'Perm Org' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Perm Project', description: 'test' }, admin.id)
    await submitProject(project.id, admin.id)
    await startAdminReview(project.id, admin.id)
    const scope = await createScope({
      projectId: project.id,
      deliverable: 'Report',
      acceptanceCriteria: 'Done',
      assumptions: '',
      exclusions: '',
      dueDate: new Date('2027-01-01'),
      fee: 1000,
      effortCapHours: 5,
    }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    // Scope is now ADMIN_REVIEW. Trying to jump to CLIENT_CONFIRMED must throw.
    const { confirmScope } = await import('@/modules/scopes/service')
    await expect(confirmScope(scope.id, admin.id)).rejects.toThrow('Invalid transition')
  })

  it('engagement service rejects invalid transition (e.g. PENDING_START → ACCEPTED skipping IN_PROGRESS)', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_2', email: 'admin2@perm.test', role: 'admin' })
    const clientUser = await upsertUser({ clerkId: 'perm_client_2', email: 'client@perm.test', role: 'client' })
    const consultantUser = await upsertUser({ clerkId: 'perm_cons_2', email: 'cons@perm.test', role: 'consultant' })
    const org = await createOrganization({ name: 'Perm Org 2' }, admin.id)
    await prisma.clientContact.create({ data: { userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email } })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    let project = await createProject({ clientId: org.id, title: 'Perm Project 2', description: 'test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    const { markReadyForMatching, markMatchingInProgress } = await import('@/modules/projects/service')
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)
    const shortlist = await createShortlist(project.id, admin.id)
    const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)
    const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: candidate.id }, admin.id)
    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, consultantUser.id)
    const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fits' }, consultantUser.id)
    await selectProposal(proposal.id, clientUser.id)
    const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
    // Engagement is PENDING_START. Trying to jump to ACCEPTED must throw.
    const { acceptEngagement } = await import('@/modules/engagements/service')
    await expect(acceptEngagement(engagement.id, admin.id)).rejects.toThrow('Invalid transition')
  })

  it('proposal service rejects selecting a PENDING_ADMIN_REVIEW proposal', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_3', email: 'admin3@perm.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'perm_cons_3', email: 'cons3@perm.test', role: 'consultant' })
    const org = await createOrganization({ name: 'Perm Org 3' }, admin.id)
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    let project = await createProject({ clientId: org.id, title: 'Perm Project 3', description: 'test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    const { markReadyForMatching, markMatchingInProgress } = await import('@/modules/projects/service')
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)
    const shortlist = await createShortlist(project.id, admin.id)
    const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)
    const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: candidate.id }, admin.id)
    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, consultantUser.id)
    const { createProposal, selectProposal } = await import('@/modules/proposals/service')
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fits', deviations: { fee: 'Need more' } },
      consultantUser.id
    )
    // Proposal is PENDING_ADMIN_REVIEW. Selecting it must throw.
    await expect(selectProposal(proposal.id, admin.id)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run tests/permissions.test.ts
```

Expected: FAIL — tests should actually pass because the guards are already implemented. If all 3 pass immediately, that confirms the invariants hold and we can commit. If any fail, the service guard is missing and must be added before committing.

- [ ] **Step 3: Run and confirm**

```bash
npx vitest run tests/permissions.test.ts
```

Expected: `Tests 3 passed (3)`

- [ ] **Step 4: Commit**

```bash
git add tests/permissions.test.ts
git commit -m "test: permission invariants — raw status bypass rejected (3 tests)"
```

---

### Task 2: Admin work queue page

A single page at `/admin/queue` showing all pending admin work across modules. No new service logic — this is a read-only Server Component that queries for items needing attention.

**Files:**
- Create: `app/(admin)/admin/queue/page.tsx`
- Modify: `app/(admin)/layout.tsx` (add nav link)

- [ ] **Step 1: Create the queue page**

```typescript
// app/(admin)/admin/queue/page.tsx
import { db } from '@/lib/db'

export default async function AdminQueuePage() {
  const [
    projectsPendingReview,
    scopesPendingReview,
    shortlistsPendingReview,
    proposalsPendingReview,
    openAdminTasks,
    openDisputes,
  ] = await Promise.all([
    db.project.findMany({
      where: { status: 'SUBMITTED' },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.scope.findMany({
      where: { status: 'ADMIN_REVIEW' },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.shortlist.findMany({
      where: { status: 'ADMIN_REVIEW' },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.proposal.findMany({
      where: { status: 'PENDING_ADMIN_REVIEW' },
      include: { invitation: { include: { project: { select: { title: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.adminTask.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'asc' },
    }),
    db.dispute.findMany({
      where: { adminReviewStatus: { in: ['OPENED', 'UNDER_ADMIN_REVIEW', 'PROPOSED_RESOLUTION'] } },
      include: { engagement: { include: { project: { select: { title: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const totalItems =
    projectsPendingReview.length +
    scopesPendingReview.length +
    shortlistsPendingReview.length +
    proposalsPendingReview.length +
    openAdminTasks.length +
    openDisputes.length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Admin Queue</h1>
        {totalItems > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {totalItems === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
          No items need attention.
        </div>
      )}

      {projectsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Projects — Awaiting Admin Review ({projectsPendingReview.length})</h2>
          <ul className="divide-y divide-slate-100">
            {projectsPendingReview.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/admin/projects/${p.id}`} className="font-medium text-indigo-600 hover:underline">{p.title}</a>
                  <span className="text-slate-400 ml-2">· {p.client.name}</span>
                </div>
                <span className="text-xs text-slate-400">{p.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scopesPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Scopes — Awaiting Approval ({scopesPendingReview.length})</h2>
          <ul className="divide-y divide-slate-100">
            {scopesPendingReview.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/scopes/${s.id}`} className="font-medium text-indigo-600 hover:underline">{s.deliverable}</a>
                  <span className="text-slate-400 ml-2">· {s.project.title}</span>
                </div>
                <span className="text-xs text-slate-400">{s.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shortlistsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Shortlists — Awaiting Approval ({shortlistsPendingReview.length})</h2>
          <ul className="divide-y divide-slate-100">
            {shortlistsPendingReview.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                <a href={`/shortlists/${s.id}`} className="font-medium text-indigo-600 hover:underline">{s.project.title}</a>
                <span className="text-xs text-slate-400">{s.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposalsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Proposals — Deviations Pending Review ({proposalsPendingReview.length})</h2>
          <ul className="divide-y divide-slate-100">
            {proposalsPendingReview.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <a href={`/proposals/${p.id}`} className="font-medium text-indigo-600 hover:underline">{p.invitation.project.title}</a>
                <span className="text-xs text-slate-400">{p.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openAdminTasks.length > 0 && (
        <section className="bg-white rounded-lg border border-amber-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Admin Tasks — Unresolved ({openAdminTasks.length})</h2>
          <ul className="divide-y divide-slate-100">
            {openAdminTasks.map(t => (
              <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-700">{t.reason}</span>
                  {t.engagementId && (
                    <a href={`/admin/engagements/${t.engagementId}`} className="text-indigo-600 hover:underline ml-2">View engagement →</a>
                  )}
                </div>
                <span className="text-xs text-slate-400">{t.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openDisputes.length > 0 && (
        <section className="bg-white rounded-lg border border-red-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Open Disputes ({openDisputes.length})</h2>
          <ul className="divide-y divide-slate-100">
            {openDisputes.map(d => (
              <li key={d.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/admin/disputes/${d.id}`} className="font-medium text-indigo-600 hover:underline">{d.engagement.project.title}</a>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 ml-2">{d.adminReviewStatus}</span>
                </div>
                <span className="text-xs text-slate-400">{d.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add Queue link to admin nav**

In `app/(admin)/layout.tsx`, find the line:
```
<a href="/admin/projects" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Projects</a>
```

Add the Queue link immediately before it (at the top of the nav):
```tsx
<a href="/admin/queue" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">
  <span>Queue</span>
</a>
```

The full nav block in `app/(admin)/layout.tsx` line ~17 becomes:
```tsx
<nav className="flex-1 px-2 py-2 text-sm space-y-0.5">
  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">Work Queue</p>
  <a href="/admin/queue" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Queue</a>
  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">Projects</p>
  <a href="/admin/projects" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Projects</a>
  <a href="/scopes" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Scopes</a>
  <a href="/shortlists" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Shortlists</a>
  <a href="/admin/invitations" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Invitations</a>
  <a href="/proposals" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Proposals</a>
  <a href="/admin/engagements" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Engagements</a>
  <a href="/admin/disputes" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Disputes</a>
  <a href="/deliverables" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Deliverables</a>
  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">People</p>
  <a href="/clients" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Clients</a>
  <a href="/consultants" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Consultants</a>
  <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">System</p>
  <a href="/events" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Event Log</a>
</nav>
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/(admin)/admin/queue/page.tsx app/(admin)/layout.tsx
git commit -m "feat: admin work queue — unified pending items across all modules"
```

---

### Task 3: Fix CI environment variables

The CI workflow uses `DATABASE_URL_TEST` but missing env vars (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `BLOB_READ_WRITE_TOKEN`) will cause `npm run build` to fail at runtime if any import-time access happens. Add them as optional (the build step doesn't exercise them live, but Next.js may reference them).

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Update CI env block**

Replace the `env:` block in `.github/workflows/ci.yml`:

```yaml
    env:
      DATABASE_URL: ${{ secrets.DATABASE_URL_TEST }}
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ${{ secrets.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY }}
      CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
      CLERK_WEBHOOK_SECRET: ${{ secrets.CLERK_WEBHOOK_SECRET }}
      ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
      BLOB_READ_WRITE_TOKEN: ${{ secrets.BLOB_READ_WRITE_TOKEN }}
      NEXT_PUBLIC_SENTRY_DSN: ${{ secrets.NEXT_PUBLIC_SENTRY_DSN }}
```

Also update `node-version` from `20` to `22` (matches Vercel default):

```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add missing env vars, upgrade Node to 22"
```

---

### Task 4: Run full test suite to confirm nothing broken

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: `Tests 43 passed (43)` (40 existing + 3 new permission tests)

- [ ] **Step 2: If passing, push to GitHub**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```
