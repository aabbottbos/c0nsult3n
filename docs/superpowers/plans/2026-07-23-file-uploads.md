# File Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deliverable URL text field with a real file picker — consultant uploads a file, it is stored in Vercel Blob, and the resulting public URL is saved to `Deliverable.fileUrl`.

**Architecture:** The consultant submits a `multipart/form-data` form containing a `File`. The Server Action calls `put()` from `@vercel/blob`, receives a public URL, and stores it in `Deliverable.fileUrl`. No new DB columns, no new API routes, no client-side JS beyond the native file input.

**Tech Stack:** `@vercel/blob`, Next.js Server Actions, Prisma 7, Neon Postgres, Vitest.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `package.json` | Modify | Add `@vercel/blob` dependency |
| `next.config.ts` | Modify | Add `serverActions.bodySizeLimit: '10mb'` |
| `app/(consultant)/engagements/[id]/page.tsx` | Modify | Replace URL text input with file input |
| `app/(consultant)/engagements/actions.ts` | Modify | Call `put()` on uploaded file; store URL |
| `.env.local` | Modify | Add `BLOB_READ_WRITE_TOKEN` |
| `tests/file-upload.test.ts` | Create | Integration test: mock `put()`, verify `fileUrl` stored |

---

## Task 1: Install `@vercel/blob` and configure body size limit

**Files:**
- Modify: `package.json`
- Modify: `next.config.ts`

- [ ] **Step 1: Install `@vercel/blob`**

```bash
cd /Users/andrewabbott/Development/Personal/Consulten/build
npm install @vercel/blob
```

Expected: `@vercel/blob` appears in `package.json` dependencies.

- [ ] **Step 2: Add `BLOB_READ_WRITE_TOKEN` to `.env.local`**

Open `.env.local` and add:

```
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_your_token_here
```

> Get the token from the Vercel dashboard → Storage → your Blob store → `.env.local` tab. It starts with `vercel_blob_rw_`.

- [ ] **Step 3: Update `next.config.ts` to set body size limit**

Replace the full file:

```typescript
import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {
    resolveAlias: {
      '@/app/generated/prisma': './app/generated/prisma/client.ts',
    },
  },
  webpack(config) {
    config.resolve.alias['@/app/generated/prisma'] = path.resolve(__dirname, 'app/generated/prisma/client.ts')
    return config
  },
}

export default nextConfig
```

- [ ] **Step 4: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json next.config.ts .env.local
git commit -m "feat: install @vercel/blob and set server action body size limit to 10mb"
```

---

## Task 2: Write the file upload test (TDD — write test first)

**Files:**
- Create: `tests/file-upload.test.ts`

**Context:** Tests in this project use Vitest and hit the real Neon dev DB. The test setup file (`tests/setup.ts`) wipes all tables in `afterEach`. Import `prisma` from `./setup`. Mock `@vercel/blob` so the test doesn't actually upload anything. The `submitDeliverableAction` is a Next.js Server Action — it calls `auth()` from Clerk, which won't work in tests. We test at the service layer instead: we call the DB transaction and `submitDeliverable` service directly, and test that `fileUrl` is stored correctly after a `put()` call returns a URL.

- [ ] **Step 1: Create `tests/file-upload.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'
import { createEngagement, startEngagement, submitDeliverable } from '@/modules/engagements/service'
import { put } from '@vercel/blob'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

const mockedPut = vi.mocked(put)

describe('file upload: deliverable fileUrl is stored', () => {
  let engagementId: string
  let consultantProfileId: string
  let adminId: string

  beforeEach(async () => {
    mockedPut.mockResolvedValue({
      url: 'https://blob.vercel-storage.com/test-deliverable.pdf',
      downloadUrl: 'https://blob.vercel-storage.com/test-deliverable.pdf?download=1',
      pathname: 'test-deliverable.pdf',
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="test-deliverable.pdf"',
    } as Awaited<ReturnType<typeof put>>)

    // Build minimum spine to get an IN_PROGRESS engagement
    const admin = await upsertUser({ clerkId: 'fu_admin', email: 'admin@fu.test', role: 'admin' })
    adminId = admin.id
    const clientUser = await upsertUser({ clerkId: 'fu_client', email: 'client@fu.test', role: 'client' })
    const consultantUser = await upsertUser({ clerkId: 'fu_consultant', email: 'consultant@fu.test', role: 'consultant' })

    const org = await createOrganization({ name: 'FU Corp' }, admin.id)
    await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    consultantProfileId = profile.id

    let project = await createProject({ clientId: org.id, title: 'FU Test', description: 'File upload test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)

    const scope = await createScope({
      projectId: project.id,
      deliverable: 'Test deliverable',
      acceptanceCriteria: 'Criteria',
      assumptions: '',
      exclusions: '',
      dueDate: new Date('2026-12-31'),
      fee: 1000,
      effortCapHours: 10,
    }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    await confirmScope(scope.id, admin.id)

    const shortlist = await createShortlist({ projectId: project.id }, admin.id)
    const candidate = await addCandidate({ shortlistId: shortlist.id, consultantId: profile.id }, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)

    const invitation = await createInvitation({ shortlistCandidateId: candidate.id, projectId: project.id, consultantId: profile.id }, admin.id)
    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, profile.id)

    const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Great fit', deviations: {} }, profile.id)
    await selectProposal(proposal.id, admin.id)

    const freshProject = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    const freshScope = await prisma.scope.findUniqueOrThrow({ where: { projectId: project.id } })
    const freshProposal = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })

    const engagement = await createEngagement({
      projectId: freshProject.id,
      scopeId: freshScope.id,
      proposalId: freshProposal.id,
      consultantId: profile.id,
      clientId: org.id,
    }, admin.id)
    await startEngagement(engagement.id, admin.id)
    engagementId = engagement.id
  })

  it('stores the blob URL in Deliverable.fileUrl after upload', async () => {
    const fakeFile = new File(['hello'], 'deliverable.pdf', { type: 'application/pdf' })
    const blobUrl = (await mockedPut('deliverable.pdf', fakeFile, { access: 'public' })).url

    // Simulate what submitDeliverableAction does: create deliverable with the URL
    const deliverable = await prisma.deliverable.create({
      data: {
        engagementId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        fileUrl: blobUrl,
      },
    })

    await submitDeliverable(engagementId, consultantProfileId)

    const saved = await prisma.deliverable.findUniqueOrThrow({ where: { id: deliverable.id } })
    expect(saved.fileUrl).toBe('https://blob.vercel-storage.com/test-deliverable.pdf')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    expect(eng.status).toBe('DELIVERABLE_SUBMITTED')
  })
})
```

- [ ] **Step 2: Run test to verify it fails (or that it can't find the import yet)**

```bash
npx vitest run tests/file-upload.test.ts
```

Expected: test runs and either fails on missing `@vercel/blob` (if not yet installed — do Task 1 first) or passes the mock setup and fails on some assertion. If `@vercel/blob` is installed, the mock should work and the test should pass already — that's fine, the DB interaction is real.

- [ ] **Step 3: Commit the test**

```bash
git add tests/file-upload.test.ts
git commit -m "test: add file upload test (mock put, verify fileUrl stored in Deliverable)"
```

---

## Task 3: Wire `put()` into `submitDeliverableAction`

**Files:**
- Modify: `app/(consultant)/engagements/actions.ts`

**Context:** The action currently reads `formData.get('fileUrl')` as a string. We change it to read `formData.get('file')` as a `File` object, call `put()`, and store the resulting URL. The rest of the action (transaction, `submitDeliverable`, email, redirect) is unchanged.

- [ ] **Step 1: Update `app/(consultant)/engagements/actions.ts`**

Replace the full file:

```typescript
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { submitDeliverable } from '@/modules/engagements/service'
import { logEvent } from '@/modules/audit-events/service'
import { sendDeliverableSubmittedEmail } from '@/lib/email'
import { put } from '@vercel/blob'

async function consultantProfileId() {
  await requireRole('consultant')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })
  return profile.id
}

export async function submitDeliverableAction(engagementId: string, formData: FormData) {
  const profileId = await consultantProfileId()
  const file = formData.get('file') as File | null

  let fileUrl: string | null = null
  if (file && file.size > 0) {
    const blob = await put(file.name, file, { access: 'public' })
    fileUrl = blob.url
  }

  await db.$transaction(async (tx) => {
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl },
    })
    await logEvent(tx, { entityType: 'Deliverable', entityId: d.id, action: 'create', actorId: profileId, actorRole: 'consultant' })
  })

  await submitDeliverable(engagementId, profileId)

  // Fire email after state transition — failure must not block redirect
  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      project: {
        include: {
          client: { include: { contacts: true } },
        },
      },
    },
  })
  const clientContact = eng.project.client.contacts[0]
  if (clientContact) {
    await sendDeliverableSubmittedEmail({
      clientEmail: clientContact.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.projectId,
      engagementId: eng.id,
    })
  }

  redirect(`/engagements/${engagementId}`)
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass (the file-upload test uses the mock so no real upload happens).

- [ ] **Step 4: Commit**

```bash
git add "app/(consultant)/engagements/actions.ts"
git commit -m "feat: upload file to Vercel Blob in submitDeliverableAction"
```

---

## Task 4: Replace URL input with file input in the consultant UI

**Files:**
- Modify: `app/(consultant)/engagements/[id]/page.tsx`

**Context:** The current form has `<input type="url" name="fileUrl">`. Replace it with `<input type="file" name="file">` and add `encType="multipart/form-data"` to the form. The form action (`submitDeliverableAction`) is unchanged.

- [ ] **Step 1: Update `app/(consultant)/engagements/[id]/page.tsx`**

Find the submit deliverable form section (lines 47–58 in the current file). Replace the entire form:

```tsx
<form action={submitDeliverableAction.bind(null, engagement.id)} encType="multipart/form-data" className="space-y-4">
  <div>
    <label className="block text-sm font-medium text-slate-700 mb-1">Deliverable file</label>
    <input
      name="file"
      type="file"
      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
      className="w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
    />
  </div>
  <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
</form>
```

The full updated `canSubmit` block should look like:

```tsx
{canSubmit && (
  <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
    <h2 className="text-sm font-semibold text-slate-700">Submit Deliverable</h2>
    <form action={submitDeliverableAction.bind(null, engagement.id)} encType="multipart/form-data" className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Deliverable file</label>
        <input
          name="file"
          type="file"
          accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip"
          className="w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
        />
      </div>
      <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
    </form>
  </div>
)}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add "app/(consultant)/engagements/[id]/page.tsx"
git commit -m "feat: replace URL text input with file picker on consultant deliverable submit form"
```

---

## Task 5: Smoke test and push

- [ ] **Step 1: Add `BLOB_READ_WRITE_TOKEN` to Vercel project env vars**

Get the token from Vercel dashboard → Storage → your Blob store → `.env.local` tab.

```bash
vercel env add BLOB_READ_WRITE_TOKEN production
# Paste the token when prompted
```

- [ ] **Step 2: Start dev server and smoke test locally**

```bash
npm run dev
```

1. Sign in as the consultant (`aabbott+consultant@gmail.com`)
2. Navigate to an engagement in `IN_PROGRESS` status
3. Pick a small PDF or text file using the file picker
4. Click Submit
5. Confirm redirect back to engagement detail page
6. Confirm the submitted deliverable shows with a link (Blob URL)
7. Click the link — file should open

- [ ] **Step 3: Push to GitHub**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```
