# M2 — Client & Consultant Portals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build self-service client and consultant portals so real users can drive a project from intake to closeout without the founder acting as proxy through the admin UI.

**Architecture:** Sequential build — role assignment first, then schema migration, then client portal, then consultant portal, then AI integration. Both portals follow the same Server Component + Server Action pattern as the admin UI. Each portal gets its own `(client)/` or `(consultant)/` route group with a layout that enforces the correct role. All mutations call existing service functions; no new service functions are needed except where noted. The Clerk webhook already exists at `/api/webhooks/clerk` — we extend it with `user.created` handling and role promotion via the Clerk Backend API.

**Tech Stack:** Next.js 16 App Router (Server Components + Server Actions), Tailwind CSS 4, Prisma 7 + Neon, Clerk v7 (`@clerk/nextjs`), Anthropic SDK (`@anthropic-ai/sdk`), TypeScript, Vitest (integration tests against real Neon dev DB).

---

## Conventions (read before any task)

**Auth pattern for portal Server Actions:**

```ts
// app/(client)/projects/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'

async function actorId() {
  await requireRole('client')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}
```

**Getting the current user's DB record from Clerk userId:**

```ts
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const { userId } = await auth()                              // Clerk user ID (string)
const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })
// contact.organizationId → ClientOrganization.id for filtering projects
```

**Tailwind design language (matches admin UI):**
- Page wrapper: `<div className="p-8 space-y-6">`
- Section card: `<div className="bg-white rounded-lg border border-slate-200 p-6">`
- Page heading: `<h1 className="text-xl font-semibold text-slate-900">`
- Status badge: `<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">`
- Primary button: `<button className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">`
- Danger button: `<button className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">`
- Back link: `<a href="/..." className="text-sm text-indigo-600 hover:underline">← Back</a>`

**Server Action button pattern:**

```tsx
import { myAction } from './actions'
<form action={myAction.bind(null, id)}>
  <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
    Do Thing
  </button>
</form>
```

**params in detail pages (Next.js 15+ async params):**

```tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // ...
}
```

**Typecheck command:** `npm run typecheck` (= `npx tsc --noEmit`)  
**Test command:** `npm test` (= `npx vitest run`) — hits the real Neon dev DB, runs sequentially  
**Lint command:** `npm run lint`

---

## File Map

**New files:**
- `prisma/migrations/` — migration for `ShortlistCandidate.rationale`
- `lib/ai.ts` — thin Anthropic SDK wrapper
- `app/(client)/layout.tsx` — client portal shell + sidebar
- `app/(client)/projects/page.tsx` — project list
- `app/(client)/projects/new/page.tsx` — new project intake form
- `app/(client)/projects/[id]/page.tsx` — stage-aware project detail
- `app/(client)/projects/actions.ts` — submitProject, confirmScope, requestScopeChanges, selectProposal, acceptDeliverable, requestRevision
- `app/(client)/engagements/[id]/page.tsx` — engagement detail
- `app/(consultant)/layout.tsx` — consultant portal shell + sidebar
- `app/(consultant)/invitations/page.tsx` — invitations inbox
- `app/(consultant)/invitations/[id]/page.tsx` — invitation detail + proposal form
- `app/(consultant)/invitations/actions.ts` — submitProposal, declineInvitation
- `app/(consultant)/engagements/page.tsx` — active engagements list
- `app/(consultant)/engagements/[id]/page.tsx` — engagement detail + deliverable submit
- `app/(consultant)/engagements/actions.ts` — submitDeliverable

**Modified files:**
- `prisma/schema.prisma` — add `ShortlistCandidate.rationale String?`
- `app/sign-up/[[...sign-up]]/page.tsx` — two-step role selector
- `app/api/webhooks/clerk/route.ts` — add `user.created` case: promote role + create DB records
- `proxy.ts` — add role-based redirect after sign-in
- `app/(admin)/projects/[id]/page.tsx` — add "Draft Scope with AI" button
- `app/(admin)/projects/actions.ts` — add `draftScopeWithAIAction`
- `app/(admin)/shortlists/[id]/page.tsx` — add "Generate Match Rationale" button + inline rationale editing
- `app/(admin)/shortlists/actions.ts` — add `generateMatchRationaleAction`
- `tests/spine.test.ts` — extend with M2 portal path assertions

---

## Task 1: Schema migration — add `ShortlistCandidate.rationale`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `rationale` field to `ShortlistCandidate` model**

In `prisma/schema.prisma`, find the `ShortlistCandidate` model and add the field:

```prisma
model ShortlistCandidate {
  id           String   @id @default(cuid())
  shortlistId  String
  consultantId String
  addedBy      String
  rationale    String?
  createdAt    DateTime @default(now())

  shortlist   Shortlist         @relation(fields: [shortlistId], references: [id])
  consultant  ConsultantProfile @relation(fields: [consultantId], references: [id])
  invitations ConsultantInvitation[]
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-shortlist-candidate-rationale
```

Expected output: `✔  Generated Prisma client` and migration file created in `prisma/migrations/`.

- [ ] **Step 3: Regenerate Prisma client**

```bash
npx prisma generate
```

Expected: `✔  Generated Prisma client` with no errors.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output (no errors).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add ShortlistCandidate.rationale field"
```

---

## Task 2: AI wrapper — `lib/ai.ts`

**Files:**
- Create: `lib/ai.ts`

- [ ] **Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

Expected: package added to `package.json` `dependencies`.

- [ ] **Step 2: Create `lib/ai.ts`**

```ts
// lib/ai.ts
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function callClaude(system: string, prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: prompt }],
  })
  const block = message.content[0]
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
  return block.text
}
```

- [ ] **Step 3: Add `ANTHROPIC_API_KEY` to `.env.local`**

Add this line to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...your-key-here...
```

Get the key from the Anthropic Console. The key must start with `sk-ant-`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add lib/ai.ts package.json package-lock.json
git commit -m "feat: add Anthropic SDK wrapper lib/ai.ts"
```

---

## Task 3: Role assignment — sign-up flow + webhook

**Files:**
- Modify: `app/sign-up/[[...sign-up]]/page.tsx`
- Modify: `app/api/webhooks/clerk/route.ts`
- Modify: `proxy.ts`

- [ ] **Step 1: Install Clerk backend SDK (if not already present)**

```bash
npm install @clerk/backend
```

Check `package.json` first — if `@clerk/backend` is already listed, skip this step.

- [ ] **Step 2: Replace sign-up page with two-step role selector**

```tsx
// app/sign-up/[[...sign-up]]/page.tsx
'use client'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignUpPage() {
  const { signUp, isLoaded, setActive } = useSignUp()
  const router = useRouter()
  const [step, setStep] = useState<'credentials' | 'role'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'client' | 'consultant' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded) return
    setLoading(true)
    setError('')
    try {
      await signUp.create({ emailAddress: email, password })
      setStep('role')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRole(e: React.FormEvent) {
    e.preventDefault()
    if (!isLoaded || !role) return
    setLoading(true)
    setError('')
    try {
      await signUp.update({ unsafeMetadata: { role } })
      const result = await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId })
        router.push(role === 'client' ? '/projects' : '/invitations')
      } else {
        // Email verification required — Clerk will handle via its own flow
        router.push('/sign-up/verify')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Role selection failed')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'credentials') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="bg-white rounded-lg border border-slate-200 p-8 w-full max-w-sm space-y-6">
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-3 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </button>
          </form>
          <p className="text-sm text-slate-500 text-center">
            Already have an account? <a href="/sign-in" className="text-indigo-600 hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="bg-white rounded-lg border border-slate-200 p-8 w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">How will you use Consulten?</h1>
        <form onSubmit={handleRole} className="space-y-4">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setRole('client')}
              className={`w-full text-left border rounded-lg p-4 transition-colors ${role === 'client' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="font-medium text-slate-900">I'm hiring a consultant</div>
              <div className="text-sm text-slate-500 mt-1">Post projects and work with expert consultants</div>
            </button>
            <button
              type="button"
              onClick={() => setRole('consultant')}
              className={`w-full text-left border rounded-lg p-4 transition-colors ${role === 'consultant' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="font-medium text-slate-900">I'm a consultant</div>
              <div className="text-sm text-slate-500 mt-1">Find fixed-scope projects that match your expertise</div>
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !role}
            className="w-full px-3 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Setting up your account...' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Extend webhook handler with `user.created` case**

Replace the content of `app/api/webhooks/clerk/route.ts` with:

```ts
// app/api/webhooks/clerk/route.ts
import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { clerkClient } from '@clerk/nextjs/server'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile } from '@/modules/consultants/service'
import type { Role } from '@/app/generated/prisma'

type ClerkUserEvent = {
  type: 'user.created' | 'user.updated'
  data: {
    id: string
    email_addresses: { email_address: string; primary: boolean }[]
    public_metadata: { role?: Role }
    unsafe_metadata: { role?: string }
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const headerPayload = await headers()
  const svixHeaders = {
    'svix-id': headerPayload.get('svix-id') ?? '',
    'svix-timestamp': headerPayload.get('svix-timestamp') ?? '',
    'svix-signature': headerPayload.get('svix-signature') ?? '',
  }

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  let event: ClerkUserEvent

  try {
    event = wh.verify(body, svixHeaders) as ClerkUserEvent
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const primary = event.data.email_addresses.find((e) => e.primary)
  if (!primary) return new Response('No primary email', { status: 400 })

  if (event.type === 'user.created') {
    const rawRole = event.data.unsafe_metadata?.role
    const role: Role = (rawRole === 'client' || rawRole === 'consultant') ? rawRole : 'client'

    // Promote to publicMetadata so session claims pick it up
    const clerk = await clerkClient()
    await clerk.users.updateUserMetadata(event.data.id, {
      publicMetadata: { role },
    })

    // Create DB user record
    const user = await upsertUser({
      clerkId: event.data.id,
      email: primary.email_address,
      role,
    })

    // Create role-specific DB records
    if (role === 'client') {
      const domain = primary.email_address.split('@')[1] ?? 'unknown'
      const org = await createOrganization({ name: domain }, user.id)
      await createContact({
        userId: user.id,
        organizationId: org.id,
        name: primary.email_address.split('@')[0] ?? 'Client',
        email: primary.email_address,
      }, user.id)
    } else if (role === 'consultant') {
      await createProfile({ userId: user.id }, user.id)
    }

    return new Response('OK')
  }

  if (event.type === 'user.updated') {
    await upsertUser({
      clerkId: event.data.id,
      email: primary.email_address,
      role: event.data.public_metadata.role ?? 'client',
    })
  }

  return new Response('OK')
}
```

- [ ] **Step 4: Add role-based post-sign-in redirect to `proxy.ts`**

Replace the content of `proxy.ts` with:

```ts
// proxy.ts
import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { Role } from '@/app/generated/prisma'

export default clerkMiddleware(async (auth, req) => {
  const publicPaths = ['/sign-in', '/sign-up', '/debug', '/api/webhooks']
  const isPublic = publicPaths.some(p => req.nextUrl.pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const { userId, sessionClaims } = await auth.protect()

  // Role-based redirect from root or /dashboard for non-admins
  const role = (sessionClaims?.metadata as { role?: Role } | undefined)?.role
  const pathname = req.nextUrl.pathname

  if (pathname === '/' || pathname === '/dashboard') {
    if (role === 'client') return NextResponse.redirect(new URL('/projects', req.url))
    if (role === 'consultant') return NextResponse.redirect(new URL('/invitations', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
```

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/sign-up app/api/webhooks/clerk/route.ts proxy.ts
git commit -m "feat: two-step sign-up with role selector and webhook role promotion"
```

---

## Task 4: Client portal layout + sidebar

**Files:**
- Create: `app/(client)/layout.tsx`

- [ ] **Step 1: Create `app/(client)/layout.tsx`**

```tsx
// app/(client)/layout.tsx
import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ReactNode } from 'react'

export default async function ClientLayout({ children }: { children: ReactNode }) {
  await requireRole('client')
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const projects = await db.project.findMany({
    where: { client: { contacts: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true },
  })

  const needsAction = (status: string) =>
    ['SCOPE_APPROVED', 'SHORTLIST_READY', 'UNDER_REVIEW'].includes(status)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-slate-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-white text-sm tracking-tight border-b border-slate-700">
          Consulten
        </div>
        <div className="px-3 py-3">
          <a
            href="/projects/new"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 mb-4"
          >
            + New Project
          </a>
          <p className="px-1 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">My Projects</p>
          <nav className="space-y-0.5">
            {projects.map(p => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-700"
              >
                <span className="truncate">{p.title}</span>
                {needsAction(p.status) && (
                  <span className="ml-1 flex-shrink-0 w-2 h-2 rounded-full bg-indigo-400" />
                )}
              </a>
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-1 text-xs text-slate-500">No projects yet.</p>
            )}
          </nav>
        </div>
        <div className="mt-auto px-3 py-4 border-t border-slate-700">
          <a href="/sign-out" className="text-xs text-slate-500 hover:text-slate-300">Sign out</a>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/\(client\)/layout.tsx
git commit -m "feat: client portal layout with project-centric sidebar"
```

---

## Task 5: Client projects list + new project form

**Files:**
- Create: `app/(client)/projects/page.tsx`
- Create: `app/(client)/projects/new/page.tsx`
- Create: `app/(client)/projects/actions.ts`

- [ ] **Step 1: Create `app/(client)/projects/actions.ts`**

```ts
// app/(client)/projects/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProject, submitProject } from '@/modules/projects/service'
import { confirmScope, requestClientChanges } from '@/modules/scopes/service'
import { selectProposal } from '@/modules/proposals/service'
import { acceptEngagement, requestRevision } from '@/modules/engagements/service'

async function actorId() {
  await requireRole('client')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

async function dbUserId() {
  await requireRole('client')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  return user.id
}

export async function createProjectAction(formData: FormData) {
  const uid = await dbUserId()
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const user = await db.user.findUniqueOrThrow({ where: { id: uid } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: uid } })
  const project = await createProject({ clientId: contact.organizationId, title, description }, uid)
  await submitProject(project.id, uid)
  redirect(`/projects/${project.id}`)
}

export async function confirmScopeAction(scopeId: string, projectId: string) {
  const uid = await dbUserId()
  await confirmScope(scopeId, uid)
  redirect(`/projects/${projectId}`)
}

export async function requestScopeChangesAction(scopeId: string, projectId: string) {
  const uid = await dbUserId()
  await requestClientChanges(scopeId, uid)
  redirect(`/projects/${projectId}`)
}

export async function selectProposalAction(proposalId: string, projectId: string) {
  const uid = await dbUserId()
  await selectProposal(proposalId, uid)
  redirect(`/projects/${projectId}`)
}

export async function acceptDeliverableAction(engagementId: string, projectId: string) {
  const uid = await dbUserId()
  await acceptEngagement(engagementId, uid)
  redirect(`/projects/${projectId}`)
}

export async function requestRevisionAction(engagementId: string, deliverableId: string, reason: string, projectId: string) {
  const uid = await dbUserId()
  const { createRevisionRequest } = await import('@/modules/deliverables/service')
  await createRevisionRequest(engagementId, deliverableId, reason, uid)
  await requestRevision(engagementId, uid)
  redirect(`/projects/${projectId}`)
}
```

- [ ] **Step 2: Create `app/(client)/projects/page.tsx`**

```tsx
// app/(client)/projects/page.tsx
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const ACTION_LABELS: Partial<Record<string, string>> = {
  SCOPE_APPROVED: 'Scope ready for review →',
  SHORTLIST_READY: 'Shortlist ready — select a consultant →',
  UNDER_REVIEW: 'Deliverable submitted — review now →',
}

export default async function ClientProjectsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })
  const projects = await db.project.findMany({
    where: { clientId: contact.organizationId },
    orderBy: { createdAt: 'desc' },
  })

  const needsAction = (status: string) => status in ACTION_LABELS

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Projects</h1>
      <div className="space-y-3">
        {projects.map(p => (
          <a
            key={p.id}
            href={`/projects/${p.id}`}
            className={`block bg-white rounded-lg border p-5 hover:border-indigo-300 transition-colors ${needsAction(p.status) ? 'border-l-4 border-l-indigo-500 border-slate-200' : 'border-slate-200'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{p.title}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.status}</span>
            </div>
            {ACTION_LABELS[p.status] && (
              <p className="text-sm text-indigo-600 mt-1">{ACTION_LABELS[p.status]}</p>
            )}
          </a>
        ))}
        {projects.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
            No projects yet. <a href="/projects/new" className="text-indigo-600 hover:underline">Start one →</a>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(client)/projects/new/page.tsx`**

```tsx
// app/(client)/projects/new/page.tsx
import { createProjectAction } from '../actions'

export default function NewProjectPage() {
  return (
    <div className="p-8 max-w-xl space-y-6">
      <a href="/projects" className="text-sm text-indigo-600 hover:underline">← My Projects</a>
      <h1 className="text-xl font-semibold text-slate-900">New Project</h1>
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <form action={createProjectAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project title</label>
            <input
              name="title"
              required
              placeholder="e.g. Competitive Landscape Analysis"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">What do you need?</label>
            <textarea
              name="description"
              required
              rows={5}
              placeholder="Describe what you're trying to accomplish, what you have available, and what a successful outcome looks like..."
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Submit Project
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/\(client\)/projects/
git commit -m "feat: client projects list, new project form, and actions"
```

---

## Task 6: Client project detail page (stage-aware)

**Files:**
- Create: `app/(client)/projects/[id]/page.tsx`

- [ ] **Step 1: Create `app/(client)/projects/[id]/page.tsx`**

```tsx
// app/(client)/projects/[id]/page.tsx
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  confirmScopeAction,
  requestScopeChangesAction,
  selectProposalAction,
  acceptDeliverableAction,
} from '../actions'

export default async function ClientProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

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
                include: { proposals: { where: { status: 'SUBMITTED' } } },
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
  if (!project) notFound()

  const engagement = project.engagements[0] ?? null
  const latestDeliverable = engagement?.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6">
      <a href="/projects" className="text-sm text-indigo-600 hover:underline">← My Projects</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{project.status}</span>
      </div>

      {/* HOLDING STATE: under review */}
      {['SUBMITTED', 'UNDER_ADMIN_REVIEW', 'NEEDS_CLARIFICATION'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project under review</h2>
          <p className="text-sm text-slate-500">Our team is reviewing your project and will define the scope. We'll notify you when it's ready.</p>
        </div>
      )}

      {/* SCOPE REVIEW */}
      {project.status === 'SCOPE_APPROVED' && project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Review Your Scope</h2>
          <p className="text-sm text-slate-500">Our team has defined the scope below. Confirm to proceed to matching, or request changes.</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{project.scope.deliverable}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{project.scope.acceptanceCriteria}</dd></div>
            <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${project.scope.fee.toString()}</dd></div>
            <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{project.scope.effortCapHours}h</dd></div>
            <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{project.scope.dueDate.toLocaleDateString()}</dd></div>
            {project.scope.assumptions && <div className="col-span-2"><dt className="text-slate-500">Assumptions</dt><dd className="text-slate-900 mt-0.5">{project.scope.assumptions}</dd></div>}
            {project.scope.exclusions && <div className="col-span-2"><dt className="text-slate-500">Exclusions</dt><dd className="text-slate-900 mt-0.5">{project.scope.exclusions}</dd></div>}
          </dl>
          <div className="flex gap-3 pt-2">
            <form action={confirmScopeAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Confirm Scope</button>
            </form>
            <form action={requestScopeChangesAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200">Request Changes</button>
            </form>
          </div>
        </div>
      )}

      {/* HOLDING STATE: finding consultant */}
      {['CLIENT_CONFIRMED', 'READY_FOR_MATCHING', 'MATCHING_IN_PROGRESS'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Finding your consultant</h2>
          <p className="text-sm text-slate-500">We're matching your project to the best available consultants. We'll notify you when the shortlist is ready.</p>
        </div>
      )}

      {/* SHORTLIST */}
      {project.status === 'SHORTLIST_READY' && project.shortlist && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Your Consultant Shortlist</h2>
          <p className="text-sm text-slate-500">We matched {project.shortlist.candidates.length} consultant{project.shortlist.candidates.length !== 1 ? 's' : ''} for your project.</p>
          <div className="space-y-4">
            {project.shortlist.candidates.map(c => {
              const proposal = c.invitations.flatMap(i => i.proposals)[0] ?? null
              return (
                <div key={c.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900 text-sm">Consultant {c.consultantId.slice(0, 8)}…</div>
                      {c.rationale && <p className="text-sm text-slate-600 mt-1 italic">"{c.rationale}"</p>}
                    </div>
                    {proposal
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Proposal in</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">Awaiting proposal</span>
                    }
                  </div>
                  {proposal && (
                    <>
                      <p className="text-sm text-slate-700">{proposal.fitStatement}</p>
                      <form action={selectProposalAction.bind(null, proposal.id, project.id)}>
                        <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Select this consultant</button>
                      </form>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ACTIVE ENGAGEMENT */}
      {['ENGAGEMENT_CREATED'].includes(project.status) && engagement && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Engagement</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
          </div>
          {latestDeliverable && engagement.status === 'UNDER_REVIEW' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">A deliverable has been submitted for your review.</p>
              <div className="flex gap-3">
                <form action={acceptDeliverableAction.bind(null, engagement.id, project.id)}>
                  <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Deliverable</button>
                </form>
                <a href={`/engagements/${engagement.id}`} className="px-3 py-1.5 text-sm font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200">View Details</a>
              </div>
            </div>
          )}
          {engagement.status !== 'UNDER_REVIEW' && (
            <a href={`/engagements/${engagement.id}`} className="text-sm text-indigo-600 hover:underline">View engagement →</a>
          )}
        </div>
      )}

      {/* CLOSED */}
      {project.status === 'CLOSED' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project closed</h2>
          <p className="text-sm text-slate-500">This project has been completed and closed.</p>
        </div>
      )}

      {/* CANCELLED */}
      {project.status === 'CANCELLED' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project cancelled</h2>
          <p className="text-sm text-slate-500">This project was cancelled.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/\(client\)/projects/\[id\]/
git commit -m "feat: client project detail page (stage-aware)"
```

---

## Task 7: Client engagement detail page

**Files:**
- Create: `app/(client)/engagements/[id]/page.tsx`

- [ ] **Step 1: Create `app/(client)/engagements/[id]/page.tsx`**

```tsx
// app/(client)/engagements/[id]/page.tsx
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { acceptDeliverableAction, requestRevisionAction } from '../../projects/actions'

export default async function ClientEngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id, clientId: contact.organizationId },
    include: {
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      project: true,
    },
  })
  if (!engagement) notFound()

  const latestDeliverable = engagement.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6">
      <a href={`/projects/${engagement.projectId}`} className="text-sm text-indigo-600 hover:underline">← {engagement.project.title}</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Engagement</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Deliverable</h2>
          <div className="text-sm text-slate-600">
            Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'}
            {latestDeliverable.fileUrl && (
              <div className="mt-2"><a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{latestDeliverable.fileUrl}</a></div>
            )}
          </div>
          {engagement.status === 'UNDER_REVIEW' && (
            <div className="flex gap-3">
              <form action={acceptDeliverableAction.bind(null, engagement.id, engagement.projectId)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Deliverable</button>
              </form>
              <form action={requestRevisionAction.bind(null, engagement.id, latestDeliverable.id, 'Revision requested by client', engagement.projectId)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Request Revision</button>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Messages</h2>
        {engagement.communications.length === 0
          ? <p className="text-sm text-slate-400">No messages yet.</p>
          : (
            <ul className="space-y-3">
              {engagement.communications.map(m => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs ml-2">{m.createdAt.toLocaleString()}</span>
                  <p className="text-slate-600 mt-0.5">{m.body}</p>
                </li>
              ))}
            </ul>
          )
        }
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/\(client\)/engagements/
git commit -m "feat: client engagement detail page"
```

---

## Task 8: Consultant portal layout + sidebar

**Files:**
- Create: `app/(consultant)/layout.tsx`

- [ ] **Step 1: Create `app/(consultant)/layout.tsx`**

```tsx
// app/(consultant)/layout.tsx
import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ReactNode } from 'react'

export default async function ConsultantLayout({ children }: { children: ReactNode }) {
  await requireRole('consultant')
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const pendingInvitations = await db.consultantInvitation.count({
    where: {
      consultantId: profile.id,
      status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] },
    },
  })

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-slate-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-white text-sm tracking-tight border-b border-slate-700">
          Consulten
        </div>
        <nav className="flex-1 px-2 py-3 text-sm space-y-0.5">
          <a href="/invitations" className="flex items-center justify-between px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">
            <span>Invitations</span>
            {pendingInvitations > 0 && (
              <span className="bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{pendingInvitations}</span>
            )}
          </a>
          <a href="/engagements" className="flex items-center px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Active Engagements</a>
        </nav>
        <div className="px-3 py-4 border-t border-slate-700">
          <a href="/sign-out" className="text-xs text-slate-500 hover:text-slate-300">Sign out</a>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/\(consultant\)/layout.tsx
git commit -m "feat: consultant portal layout with inbox-style sidebar"
```

---

## Task 9: Consultant invitations inbox + detail + actions

**Files:**
- Create: `app/(consultant)/invitations/page.tsx`
- Create: `app/(consultant)/invitations/[id]/page.tsx`
- Create: `app/(consultant)/invitations/actions.ts`

- [ ] **Step 1: Create `app/(consultant)/invitations/actions.ts`**

```ts
// app/(consultant)/invitations/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProposal } from '@/modules/proposals/service'
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
  await createProposal({ invitationId, consultantId: profileId, fitStatement }, profileId)
  redirect(`/invitations/${invitationId}`)
}

export async function declineInvitationAction(invitationId: string) {
  const { profileId } = await consultantProfileId()
  await declineInvitation(invitationId, profileId)
  redirect('/invitations')
}
```

- [ ] **Step 2: Create `app/(consultant)/invitations/page.tsx`**

```tsx
// app/(consultant)/invitations/page.tsx
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

function daysUntil(date: Date | null): number | null {
  if (!date) return null
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

function urgencyClass(days: number | null) {
  if (days === null) return 'text-slate-400'
  if (days < 5) return 'text-red-600 font-semibold'
  if (days < 10) return 'text-amber-600 font-semibold'
  return 'text-slate-500'
}

export default async function ConsultantInvitationsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const invitations = await db.consultantInvitation.findMany({
    where: {
      consultantId: profile.id,
      status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] },
    },
    include: { project: { include: { scope: true } } },
    orderBy: { sentAt: 'asc' },
  })

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Invitations</h1>
      <div className="space-y-3">
        {invitations.map(inv => {
          const days = daysUntil(inv.expiresAt)
          return (
            <div key={inv.id} className="bg-white rounded-lg border border-l-4 border-l-indigo-500 border-slate-200 p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-slate-900">{inv.project.title}</div>
                  {inv.project.scope && (
                    <div className="text-sm text-slate-500 mt-1">
                      ${inv.project.scope.fee.toString()} · {inv.project.scope.effortCapHours}h cap · Due {inv.project.scope.dueDate.toLocaleDateString()}
                    </div>
                  )}
                </div>
                {days !== null && (
                  <span className={`text-xs ${urgencyClass(days)}`}>{days} day{days !== 1 ? 's' : ''} left</span>
                )}
              </div>
              <a href={`/invitations/${inv.id}`} className="inline-block px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
                View & Respond
              </a>
            </div>
          )
        })}
        {invitations.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No pending invitations.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(consultant)/invitations/[id]/page.tsx`**

```tsx
// app/(consultant)/invitations/[id]/page.tsx
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitProposalAction, declineInvitationAction } from '../actions'

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
  const canRespond = ['SENT', 'VIEWED', 'QUESTIONS_ASKED', 'ACCEPTED_INTEREST'].includes(invitation.status)

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
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Your Proposal</h2>
          <p className="text-sm text-slate-600">{existingProposal.fitStatement}</p>
          <p className="text-xs text-slate-400 mt-2">Submitted {existingProposal.createdAt.toLocaleDateString()}</p>
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
            <div className="flex gap-3">
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

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/\(consultant\)/invitations/
git commit -m "feat: consultant invitations inbox, detail, and proposal actions"
```

---

## Task 10: Consultant engagements list + detail + deliverable submit

**Files:**
- Create: `app/(consultant)/engagements/page.tsx`
- Create: `app/(consultant)/engagements/[id]/page.tsx`
- Create: `app/(consultant)/engagements/actions.ts`

- [ ] **Step 1: Create `app/(consultant)/engagements/actions.ts`**

```ts
// app/(consultant)/engagements/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createDeliverable } from '@/modules/deliverables/service'
import { submitDeliverable } from '@/modules/engagements/service'

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
  const fileUrl = formData.get('fileUrl') as string

  // Create the deliverable record with the URL
  const deliverable = await db.$transaction(async (tx) => {
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl: fileUrl || null },
    })
    const { logEvent } = await import('@/modules/audit-events/service')
    await logEvent(tx, { entityType: 'Deliverable', entityId: d.id, action: 'create', actorId: profileId, actorRole: 'consultant' })
    return d
  })

  // Transition engagement to DELIVERABLE_SUBMITTED
  await submitDeliverable(engagementId, profileId)
  redirect(`/engagements/${engagementId}`)
}
```

- [ ] **Step 2: Create `app/(consultant)/engagements/page.tsx`**

```tsx
// app/(consultant)/engagements/page.tsx
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export default async function ConsultantEngagementsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const engagements = await db.engagement.findMany({
    where: {
      consultantId: profile.id,
      status: { notIn: ['CLOSED', 'CANCELLED'] },
    },
    include: { project: true, scope: true },
    orderBy: { createdAt: 'desc' },
  })

  const statusColors: Record<string, string> = {
    PENDING_START: 'bg-slate-100 text-slate-600',
    IN_PROGRESS: 'bg-green-100 text-green-700',
    DELIVERABLE_SUBMITTED: 'bg-blue-100 text-blue-700',
    UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
    REVISION_REQUESTED: 'bg-orange-100 text-orange-700',
    DISPUTED: 'bg-red-100 text-red-700',
    ACCEPTED: 'bg-green-100 text-green-700',
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Active Engagements</h1>
      <div className="space-y-3">
        {engagements.map(e => (
          <a
            key={e.id}
            href={`/engagements/${e.id}`}
            className="block bg-white rounded-lg border border-l-4 border-l-green-500 border-slate-200 p-5 hover:border-indigo-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">{e.project.title}</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[e.status] ?? 'bg-slate-100 text-slate-600'}`}>{e.status}</span>
            </div>
            <div className="text-sm text-slate-500 mt-1">${e.scope.fee.toString()} · Due {e.scope.dueDate.toLocaleDateString()}</div>
          </a>
        ))}
        {engagements.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No active engagements.</div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `app/(consultant)/engagements/[id]/page.tsx`**

```tsx
// app/(consultant)/engagements/[id]/page.tsx
import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitDeliverableAction } from '../actions'

export default async function ConsultantEngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id, consultantId: profile.id },
    include: {
      project: true,
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!engagement) notFound()

  const canSubmit = engagement.status === 'IN_PROGRESS'

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <a href="/engagements" className="text-sm text-indigo-600 hover:underline">← Engagements</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{engagement.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope Reminder</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.acceptanceCriteria}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {canSubmit && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Submit Deliverable</h2>
          <form action={submitDeliverableAction.bind(null, engagement.id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">File URL or link</label>
              <input
                name="fileUrl"
                type="url"
                placeholder="https://docs.google.com/... or https://drive.google.com/..."
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
          </form>
        </div>
      )}

      {engagement.deliverables.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Submitted Deliverables</h2>
          {engagement.deliverables.map(d => (
            <div key={d.id} className="text-sm">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 mr-2">{d.status}</span>
              {d.submittedAt?.toLocaleDateString()}
              {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-indigo-600 hover:underline break-all">{d.fileUrl}</a>}
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Messages</h2>
        {engagement.communications.length === 0
          ? <p className="text-sm text-slate-400">No messages yet.</p>
          : (
            <ul className="space-y-3">
              {engagement.communications.map(m => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs ml-2">{m.createdAt.toLocaleString()}</span>
                  <p className="text-slate-600 mt-0.5">{m.body}</p>
                </li>
              ))}
            </ul>
          )
        }
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add app/\(consultant\)/engagements/
git commit -m "feat: consultant engagements list, detail, and deliverable submit"
```

---

## Task 11: AI integration — scope drafting (admin UI)

**Files:**
- Modify: `app/(admin)/projects/actions.ts`
- Modify: `app/(admin)/projects/[id]/page.tsx`

- [ ] **Step 1: Add `draftScopeWithAIAction` to `app/(admin)/projects/actions.ts`**

Add these imports and function to the existing file:

```ts
// Add to existing imports at top of app/(admin)/projects/actions.ts
import { createScope, moveToAdminReview } from '@/modules/scopes/service'
import { callClaude } from '@/lib/ai'
import { db } from '@/lib/db'

// Add this function to the file
export async function draftScopeWithAIAction(projectId: string) {
  await requireRole('admin')
  const actor = await actorId()

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })

  const system = `You are an expert business analyst. Given a project description, produce a structured scope for a fixed-fee consulting engagement (max 10 hours). Respond ONLY with valid JSON matching this schema exactly:
{
  "deliverable": "string — what will be produced",
  "acceptanceCriteria": "string — how done is verified",
  "assumptions": "string — what must be true for the work to proceed",
  "exclusions": "string — what this engagement does NOT include",
  "feeEstimate": number,
  "effortCapHours": number,
  "dueDateDaysFromNow": number
}`

  const prompt = `Project title: ${project.title}\n\nProject description: ${project.description}\n\nProduce the scope JSON now.`

  const raw = await callClaude(system, prompt)

  let parsed: {
    deliverable: string
    acceptanceCriteria: string
    assumptions: string
    exclusions: string
    feeEstimate: number
    effortCapHours: number
    dueDateDaysFromNow: number
  }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (parsed.dueDateDaysFromNow ?? 30))

  const scope = await createScope({
    projectId,
    deliverable: parsed.deliverable,
    acceptanceCriteria: parsed.acceptanceCriteria,
    assumptions: parsed.assumptions,
    exclusions: parsed.exclusions,
    dueDate,
    fee: parsed.feeEstimate,
    effortCapHours: parsed.effortCapHours,
  }, actor)

  await db.aIOutputLog.create({
    data: {
      touchpoint: 'scope_draft',
      promptVersion: 'v1',
      model: 'claude-sonnet-4-6',
      inputSummary: `Project: ${project.title}`,
      output: raw,
      exposed: false,
      reviewed: false,
    },
  })

  await moveToAdminReview(scope.id, actor)
  redirect(`/scopes/${scope.id}`)
}
```

- [ ] **Step 2: Add "Draft Scope with AI" button to `app/(admin)/projects/[id]/page.tsx`**

In the existing Actions section of the page, add the button after the existing action buttons. Find the closing of the actions `<div className="flex flex-wrap gap-2">` block and add before the `{allowed.length === 0 ...}` line:

```tsx
// Add to imports at top of file:
import { draftScopeWithAIAction } from '../actions'

// Add inside the <div className="flex flex-wrap gap-2"> in the Actions section,
// after the existing action buttons:
{project.status === 'UNDER_ADMIN_REVIEW' && !project.scope && (
  <form action={draftScopeWithAIAction.bind(null, id)}>
    <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-purple-600 text-white hover:bg-purple-700">Draft Scope with AI</button>
  </form>
)}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/projects/
git commit -m "feat: AI scope drafting button on admin project detail"
```

---

## Task 12: AI integration — match rationale (admin UI)

**Files:**
- Modify: `app/(admin)/shortlists/actions.ts`
- Modify: `app/(admin)/shortlists/[id]/page.tsx`

- [ ] **Step 1: Add `generateMatchRationaleAction` to `app/(admin)/shortlists/actions.ts`**

Add these imports and function to the existing file:

```ts
// Add to existing imports at top of app/(admin)/shortlists/actions.ts
import { callClaude } from '@/lib/ai'
import { db } from '@/lib/db'

// Add this function to the file
export async function generateMatchRationaleAction(shortlistId: string) {
  await requireRole('admin')
  const actor = await actorId()

  const shortlist = await db.shortlist.findUniqueOrThrow({
    where: { id: shortlistId },
    include: {
      project: { include: { scope: true } },
      candidates: { include: { consultant: true } },
    },
  })

  if (!shortlist.project.scope) throw new Error('Cannot generate rationale: no approved scope')

  const scope = shortlist.project.scope
  const system = `You are matching consultants to a fixed-scope consulting engagement. For each consultant, write a 2-3 sentence client-facing rationale explaining why they are a strong fit. Be specific. Do not make things up about the consultant — only reference their profile data. Respond ONLY with valid JSON: { "rationales": [{ "candidateId": "string", "rationale": "string" }] }`

  const candidatesText = shortlist.candidates.map(c =>
    `CandidateId: ${c.id}\nConsultantProfileId: ${c.consultantId}\nApprovalStatus: ${c.consultant.approvalStatus}\nAccountStatus: ${c.consultant.accountStatus}`
  ).join('\n\n')

  const prompt = `Engagement scope:\nDeliverable: ${scope.deliverable}\nAcceptance criteria: ${scope.acceptanceCriteria}\nFee: $${scope.fee} / ${scope.effortCapHours}h cap\n\nCandidates:\n${candidatesText}\n\nGenerate rationale JSON now.`

  const raw = await callClaude(system, prompt)

  let parsed: { rationales: { candidateId: string; rationale: string }[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  await Promise.all(parsed.rationales.map(r =>
    db.shortlistCandidate.update({
      where: { id: r.candidateId },
      data: { rationale: r.rationale },
    })
  ))

  await db.aIOutputLog.create({
    data: {
      touchpoint: 'match_rationale',
      promptVersion: 'v1',
      model: 'claude-sonnet-4-6',
      inputSummary: `Shortlist: ${shortlistId}, Project: ${shortlist.project.title}`,
      output: raw,
      exposed: false,
      reviewed: false,
    },
  })

  redirect(`/shortlists/${shortlistId}`)
}
```

- [ ] **Step 2: Add "Generate Match Rationale" button and inline rationale display to `app/(admin)/shortlists/[id]/page.tsx`**

Add to existing imports:

```tsx
import { generateMatchRationaleAction } from '../actions'
```

In the candidates section of the shortlist detail page, add the generate button and rationale display. Find the candidates list and replace/extend it:

```tsx
// Add the generate button inside the Actions section (before or after existing action buttons):
{(shortlist.status === 'ADMIN_REVIEW' || shortlist.status === 'CLIENT_VISIBLE') && (
  <form action={generateMatchRationaleAction.bind(null, id)}>
    <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-purple-600 text-white hover:bg-purple-700">Generate Match Rationale</button>
  </form>
)}

// In the candidates section, show rationale beneath each candidate:
{shortlist.candidates.map(c => (
  <li key={c.id} className="text-sm text-slate-700">
    <a href={`/consultants/${c.consultantId}`} className="text-indigo-600 hover:underline">{c.consultantId}</a>
    {c.rationale && (
      <p className="text-xs text-slate-500 mt-0.5 italic">"{c.rationale}"</p>
    )}
  </li>
))}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/\(admin\)/shortlists/
git commit -m "feat: AI match rationale generation on admin shortlist detail"
```

---

## Task 13: Integration tests

**Files:**
- Modify: `tests/spine.test.ts`

- [ ] **Step 1: Add M2 portal permission tests to `tests/spine.test.ts`**

Add a new `describe` block at the bottom of the existing test file:

```ts
// Add these imports at the top of tests/spine.test.ts if not already present:
import { createContact, createOrganization } from '@/modules/clients/service'
import { createProfile } from '@/modules/consultants/service'
import { createProject, submitProject } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope } from '@/modules/scopes/service'
import { createProposal } from '@/modules/proposals/service'

describe('M2 portal permission invariants', () => {
  it('client can only see their own organization projects', async () => {
    const admin = await upsertUser({ clerkId: 'm2_admin', email: 'admin@m2.test', role: 'admin' })
    const clientUserA = await upsertUser({ clerkId: 'm2_client_a', email: 'a@m2.test', role: 'client' })
    const clientUserB = await upsertUser({ clerkId: 'm2_client_b', email: 'b@m2.test', role: 'client' })

    const orgA = await createOrganization({ name: 'Org A' }, admin.id)
    const orgB = await createOrganization({ name: 'Org B' }, admin.id)
    await createContact({ userId: clientUserA.id, organizationId: orgA.id, name: 'A', email: 'a@m2.test' }, admin.id)
    await createContact({ userId: clientUserB.id, organizationId: orgB.id, name: 'B', email: 'b@m2.test' }, admin.id)

    const projectA = await createProject({ clientId: orgA.id, title: 'Project A', description: 'A' }, admin.id)
    const projectB = await createProject({ clientId: orgB.id, title: 'Project B', description: 'B' }, admin.id)

    // Client A can only see orgA's projects
    const contactA = await prisma.clientContact.findUniqueOrThrow({ where: { userId: clientUserA.id } })
    const projectsForA = await prisma.project.findMany({ where: { clientId: contactA.organizationId } })
    expect(projectsForA.map(p => p.id)).toContain(projectA.id)
    expect(projectsForA.map(p => p.id)).not.toContain(projectB.id)
  })

  it('consultant can only see their own invitations', async () => {
    const admin = await upsertUser({ clerkId: 'm2_inv_admin', email: 'admin@m2inv.test', role: 'admin' })
    const consultantUserA = await upsertUser({ clerkId: 'm2_cons_a', email: 'cons_a@m2.test', role: 'consultant' })
    const consultantUserB = await upsertUser({ clerkId: 'm2_cons_b', email: 'cons_b@m2.test', role: 'consultant' })

    const profileA = await createProfile({ userId: consultantUserA.id }, admin.id)
    const profileB = await createProfile({ userId: consultantUserB.id }, admin.id)

    const org = await createOrganization({ name: 'Test Org M2' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Test Project M2', description: 'desc' }, admin.id)
    await submitProject(project.id, admin.id)

    const shortlist = await prisma.shortlist.create({ data: { projectId: project.id } })
    const candidateA = await prisma.shortlistCandidate.create({ data: { shortlistId: shortlist.id, consultantId: profileA.id, addedBy: admin.id } })

    const invitationA = await prisma.consultantInvitation.create({
      data: { shortlistCandidateId: candidateA.id, projectId: project.id, consultantId: profileA.id, status: 'SENT' },
    })

    // Consultant A sees their invitation
    const invForA = await prisma.consultantInvitation.findMany({
      where: { consultantId: profileA.id, status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] } },
    })
    expect(invForA.map(i => i.id)).toContain(invitationA.id)

    // Consultant B does NOT see consultant A's invitation
    const invForB = await prisma.consultantInvitation.findMany({
      where: { consultantId: profileB.id, status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] } },
    })
    expect(invForB.map(i => i.id)).not.toContain(invitationA.id)
  })

  it('webhook: user.created with role client creates org + contact records', async () => {
    // Simulate what the webhook handler does for a client sign-up
    const clerkId = 'm2_wh_client'
    const email = 'webhook_client@m2.test'
    const role = 'client' as const

    const user = await upsertUser({ clerkId, email, role })
    const domain = email.split('@')[1]!
    const org = await createOrganization({ name: domain }, user.id)
    await createContact({ userId: user.id, organizationId: org.id, name: email.split('@')[0]!, email }, user.id)

    const contact = await prisma.clientContact.findUnique({ where: { userId: user.id } })
    expect(contact).not.toBeNull()
    expect(contact!.organizationId).toBe(org.id)
  })

  it('webhook: user.created with role consultant creates profile record', async () => {
    const clerkId = 'm2_wh_consultant'
    const email = 'webhook_consultant@m2.test'
    const role = 'consultant' as const

    const user = await upsertUser({ clerkId, email, role })
    const profile = await createProfile({ userId: user.id }, user.id)

    const found = await prisma.consultantProfile.findUnique({ where: { userId: user.id } })
    expect(found).not.toBeNull()
    expect(found!.approvalStatus).toBe('pending')
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npm test
```

Expected: all tests pass (existing 5 + new 4 = 9 total). If any existing tests fail, do not proceed — fix the regression first.

- [ ] **Step 3: Commit**

```bash
git add tests/spine.test.ts
git commit -m "test: add M2 portal permission invariant tests"
```

---

## Task 14: Final typecheck, lint, and push

- [ ] **Step 1: Full typecheck**

```bash
npm run typecheck
```

Expected: no output.

- [ ] **Step 2: Lint**

```bash
npm run lint
```

Expected: no errors (warnings are OK).

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Push to GitHub**

```bash
cd /Users/andrewabbott/Development && git subtree push --prefix=Personal/Consulten/build consulten main
```

Expected: `To https://github.com/aabbottbos/c0nsult3n.git` with branch updated.

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by task |
|---|---|
| Route structure — client portal | Tasks 4–7 |
| Route structure — consultant portal | Tasks 8–10 |
| Client sidebar (project-centric) | Task 4 |
| Consultant sidebar (inbox-style with badge) | Task 8 |
| Client projects list + action callouts | Task 5 |
| Client new project form (intake) | Task 5 |
| Client project detail (stage-aware, all statuses) | Task 6 |
| Client engagement detail + accept/revise | Task 7 |
| Consultant invitations inbox with countdown | Task 9 |
| Consultant invitation detail + proposal form | Task 9 |
| Consultant engagements list | Task 10 |
| Consultant engagement detail + deliverable URL submit | Task 10 |
| Role assignment — sign-up two-step flow | Task 3 |
| Role assignment — webhook promotes publicMetadata | Task 3 |
| Role assignment — creates client org + contact | Task 3 |
| Role assignment — creates consultant profile | Task 3 |
| Post-sign-in role-based redirect | Task 3 |
| Schema migration — ShortlistCandidate.rationale | Task 1 |
| AI wrapper lib/ai.ts | Task 2 |
| AI scope drafting button (admin project detail) | Task 11 |
| AI scope drafting logs to AIOutputLog | Task 11 |
| AI match rationale button (admin shortlist detail) | Task 12 |
| AI match rationale writes to candidate.rationale | Task 12 |
| AI match rationale logs to AIOutputLog | Task 12 |
| Client shortlist shows rationale | Task 6 |
| Permission tests | Task 13 |
| Webhook DB record tests | Task 13 |

**Placeholder scan:** All code blocks are complete. No TBDs. All function names are consistent across tasks. `actorId()` helper is defined in each `actions.ts` file independently — no cross-file dependency confusion.

**Type consistency check:**
- `confirmScopeAction(scopeId, projectId)` — used in Task 6 detail page, defined in Task 5 actions ✓
- `selectProposalAction(proposalId, projectId)` — used in Task 6, defined in Task 5 ✓
- `acceptDeliverableAction(engagementId, projectId)` — used in Tasks 6 and 7, defined in Task 5 ✓
- `requestRevisionAction(engagementId, deliverableId, reason, projectId)` — used in Task 7, defined in Task 5 ✓
- `submitProposalAction(invitationId, formData)` — used in Task 9 detail, defined in Task 9 actions ✓
- `declineInvitationAction(invitationId)` — used in Task 9 detail, defined in Task 9 actions ✓
- `submitDeliverableAction(engagementId, formData)` — used in Task 10 detail, defined in Task 10 actions ✓
- `draftScopeWithAIAction(projectId)` — used in Task 11 page, defined in Task 11 actions ✓
- `generateMatchRationaleAction(shortlistId)` — used in Task 12 page, defined in Task 12 actions ✓
- `callClaude(system, prompt)` — defined in Task 2, called in Tasks 11 and 12 ✓
- `db.aIOutputLog` — Prisma model name for `AIOutputLog` is `aIOutputLog` (Prisma camelCase) ✓
