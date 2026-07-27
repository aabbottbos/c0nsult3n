# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flesh out the stub `Notification` model into a real in-app notification system. Every workflow event that currently sends a Resend email also writes a `Notification` record. Clients and consultants see their unread notifications in a sidebar badge + inbox page.

**Architecture:** `Notification` model gets `recipientId`, `type`, `body`, `link`, `read` fields. A `modules/notifications/service.ts` module exposes `createNotification` and `markRead`. Every service that calls an email function also calls `createNotification` immediately after (fire-and-forget pattern, same as email). Portals show a badge count in the sidebar and a `/notifications` inbox page. Admin does not get a notification inbox — admins use the work queue.

**Tech Stack:** Prisma 7, Next.js App Router Server Components + Server Actions.

**Scope boundary:** Notifications are written server-side after workflow events. No polling, no WebSockets, no push — user refreshes to see new ones. That's the MVP A bar.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `prisma/schema.prisma` | Modify | Expand `Notification` stub to full model |
| `prisma/migrations/` | Create | Migration |
| `modules/notifications/service.ts` | Create | `createNotification`, `markRead`, `listNotifications` |
| `modules/notifications/types.ts` | Create | `NotificationType` enum values |
| `modules/engagements/service.ts` | Modify | Call `createNotification` alongside email calls |
| `modules/invitations/service.ts` | Modify | Call `createNotification` on invitation sent |
| `modules/deliverables/service.ts` | Modify | Call `createNotification` on deliverable submitted, QA complete, revision requested |
| `app/(client)/layout.tsx` | Modify | Add notification badge to sidebar |
| `app/(consultant)/layout.tsx` | Modify | Add notification badge to sidebar |
| `app/(client)/notifications/page.tsx` | Create | Client notification inbox |
| `app/(consultant)/notifications/page.tsx` | Create | Consultant notification inbox |
| `app/(client)/notifications/actions.ts` | Create | `markReadAction` |
| `app/(consultant)/notifications/actions.ts` | Create | `markReadAction` |
| `tests/notifications.test.ts` | Create | Service tests |
| `tests/setup.ts` | Modify | Add `Notification` to TRUNCATE list (already covered by CASCADE — verify) |

---

### Task 1: Expand Notification schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Replace the stub Notification model**

Find this in `prisma/schema.prisma`:
```prisma
model Notification {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now())
}
```

Replace with:
```prisma
enum NotificationType {
  INVITATION_SENT
  PROPOSAL_SELECTED
  ENGAGEMENT_STARTED
  DELIVERABLE_SUBMITTED
  AI_QA_COMPLETE
  REVISION_REQUESTED
  ENGAGEMENT_CLOSED
}

model Notification {
  id          String           @id @default(cuid())
  recipientId String
  type        NotificationType
  body        String
  link        String
  read        Boolean          @default(false)
  createdAt   DateTime         @default(now())

  recipient User @relation(fields: [recipientId], references: [id])

  @@index([recipientId, read])
}
```

Also add back-relation to `User` model — find `model User` and add:
```prisma
  notifications Notification[]
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name expand_notification_model
```

Expected: migration created and applied.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 2: Notification service module

**Files:**
- Create: `modules/notifications/types.ts`
- Create: `modules/notifications/service.ts`

- [ ] **Step 1: Create types file**

```typescript
// modules/notifications/types.ts
export type NotificationInput = {
  recipientId: string
  type: 'INVITATION_SENT' | 'PROPOSAL_SELECTED' | 'ENGAGEMENT_STARTED' | 'DELIVERABLE_SUBMITTED' | 'AI_QA_COMPLETE' | 'REVISION_REQUESTED' | 'ENGAGEMENT_CLOSED'
  body: string
  link: string
}
```

- [ ] **Step 2: Create service**

```typescript
// modules/notifications/service.ts
import { db } from '@/lib/db'
import type { NotificationInput } from './types'

export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        body: input.body,
        link: input.link,
      },
    })
  } catch (err) {
    console.error('[notifications] Failed to create notification:', input.type, err)
  }
}

export async function markRead(notificationId: string): Promise<void> {
  await db.notification.update({ where: { id: notificationId }, data: { read: true } })
}

export async function markAllRead(recipientId: string): Promise<void> {
  await db.notification.updateMany({ where: { recipientId, read: false }, data: { read: true } })
}

export async function listNotifications(recipientId: string) {
  return db.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function countUnread(recipientId: string): Promise<number> {
  return db.notification.count({ where: { recipientId, read: false } })
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 3: Wire notifications into invitation service

**Files:**
- Modify: `modules/invitations/service.ts`

- [ ] **Step 1: Read the current sendInvitation function**

```bash
grep -n "sendInvitation\|sendInvitationEmail" modules/invitations/service.ts
```

- [ ] **Step 2: Add notification call after email in `sendInvitation`**

Find where `sendInvitationEmail` is called in `modules/invitations/service.ts`. Immediately after it, add:

```typescript
import { createNotification } from '@/modules/notifications/service'

// Inside sendInvitation, after sendInvitationEmail call:
await createNotification({
  recipientId: consultantUser.id,
  type: 'INVITATION_SENT',
  body: `You have been invited to a project: ${project.title}`,
  link: `/invitations/${invitation.id}`,
})
```

The exact insertion point depends on where `sendInvitationEmail` is called. Look for the pattern: after `await sendInvitationEmail(...)`, add the `createNotification` call. Both are fire-and-forget — no `await` needed on `createNotification` since it catches its own errors, but using `await` is fine too (it won't throw).

Look up the consultant user ID: `sendInvitation` already fetches the profile to get consultant email. Add a lookup of the `User` record for the consultant:
```typescript
const consultantUser = await db.user.findUniqueOrThrow({ where: { id: profile.userId } })
```
Then use `consultantUser.id` as `recipientId`.

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

---

### Task 4: Wire notifications into engagements service

**Files:**
- Modify: `modules/engagements/service.ts`

- [ ] **Step 1: Add notifications after email calls**

In `modules/engagements/service.ts`, find each email call and add a matching notification. The pattern is: immediately after the email fire-and-forget, call `createNotification`. Import at top of file:

```typescript
import { createNotification } from '@/modules/notifications/service'
```

After `sendProposalSelectedEmail` (in `createEngagement` or `selectProposal` flow):
```typescript
await createNotification({
  recipientId: consultantUserId, // the consultant's User.id
  type: 'PROPOSAL_SELECTED',
  body: `Your proposal was selected for ${projectTitle}.`,
  link: `/engagements/${engagementId}`,
})
```

After `sendEngagementStartedEmail` (client notification when engagement starts):
```typescript
await createNotification({
  recipientId: clientUserId, // the client contact's User.id
  type: 'ENGAGEMENT_STARTED',
  body: `Your engagement for ${projectTitle} has started.`,
  link: `/projects/${projectId}/engagement/${engagementId}`,
})
```

After `sendEngagementClosedEmail` for client:
```typescript
await createNotification({
  recipientId: clientUserId,
  type: 'ENGAGEMENT_CLOSED',
  body: `Your engagement for ${projectTitle} has been closed.`,
  link: `/projects/${projectId}/engagement/${engagementId}`,
})
```

After `sendEngagementClosedEmail` for consultant:
```typescript
await createNotification({
  recipientId: consultantUserId,
  type: 'ENGAGEMENT_CLOSED',
  body: `Your engagement for ${projectTitle} has been closed.`,
  link: `/engagements/${engagementId}`,
})
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

---

### Task 5: Wire notifications into deliverables service

**Files:**
- Modify: `modules/deliverables/service.ts`

- [ ] **Step 1: Add notifications after email calls**

Import at top:
```typescript
import { createNotification } from '@/modules/notifications/service'
```

After `sendDeliverableSubmittedEmail` (client notification — deliverable ready for review):
```typescript
await createNotification({
  recipientId: clientUserId,
  type: 'DELIVERABLE_SUBMITTED',
  body: `A deliverable has been submitted for ${projectTitle}.`,
  link: `/projects/${projectId}/engagement/${engagementId}`,
})
```

After `sendAiQaCompleteEmail` (client — QA done, ready to accept):
```typescript
await createNotification({
  recipientId: clientUserId,
  type: 'AI_QA_COMPLETE',
  body: `Your deliverable for ${projectTitle} has been reviewed and is ready for acceptance.`,
  link: `/projects/${projectId}/engagement/${engagementId}`,
})
```

After `sendRevisionRequestedEmail` (consultant — revision needed):
```typescript
await createNotification({
  recipientId: consultantUserId,
  type: 'REVISION_REQUESTED',
  body: `A revision has been requested for ${projectTitle}.`,
  link: `/engagements/${engagementId}`,
})
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

---

### Task 6: Notification service tests

**Files:**
- Create: `tests/notifications.test.ts`

- [ ] **Step 1: Write tests**

```typescript
// tests/notifications.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createNotification, markRead, markAllRead, listNotifications, countUnread } from '@/modules/notifications/service'

describe('Notifications', () => {
  it('createNotification writes a record for the recipient', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_1', email: 'user1@notif.test', role: 'consultant' })

    await createNotification({
      recipientId: user.id,
      type: 'INVITATION_SENT',
      body: 'You have been invited to a project: Test Project',
      link: '/invitations/abc123',
    })

    const notifications = await listNotifications(user.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('INVITATION_SENT')
    expect(notifications[0].read).toBe(false)
    expect(notifications[0].link).toBe('/invitations/abc123')
  })

  it('countUnread returns correct count and decrements on markRead', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_2', email: 'user2@notif.test', role: 'client' })

    await createNotification({ recipientId: user.id, type: 'DELIVERABLE_SUBMITTED', body: 'Deliverable ready', link: '/projects/p1/engagement/e1' })
    await createNotification({ recipientId: user.id, type: 'AI_QA_COMPLETE', body: 'QA done', link: '/projects/p1/engagement/e1' })

    expect(await countUnread(user.id)).toBe(2)

    const [first] = await listNotifications(user.id)
    await markRead(first.id)

    expect(await countUnread(user.id)).toBe(1)
  })

  it('markAllRead clears all unread for recipient', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_3', email: 'user3@notif.test', role: 'client' })

    await createNotification({ recipientId: user.id, type: 'ENGAGEMENT_STARTED', body: 'Engagement started', link: '/projects/p1/engagement/e1' })
    await createNotification({ recipientId: user.id, type: 'ENGAGEMENT_CLOSED', body: 'Engagement closed', link: '/projects/p1/engagement/e1' })

    await markAllRead(user.id)

    expect(await countUnread(user.id)).toBe(0)
    const all = await listNotifications(user.id)
    expect(all.every(n => n.read)).toBe(true)
  })

  it('notifications are scoped per recipient — user B cannot see user A notifications', async () => {
    const userA = await upsertUser({ clerkId: 'notif_userA', email: 'userA@notif.test', role: 'consultant' })
    const userB = await upsertUser({ clerkId: 'notif_userB', email: 'userB@notif.test', role: 'client' })

    await createNotification({ recipientId: userA.id, type: 'INVITATION_SENT', body: 'A gets this', link: '/invitations/xyz' })

    const bNotifs = await listNotifications(userB.id)
    expect(bNotifs).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/notifications.test.ts
```

Expected: `Tests 4 passed (4)`

- [ ] **Step 3: Commit**

```bash
git add tests/notifications.test.ts modules/notifications/ modules/invitations/service.ts modules/engagements/service.ts modules/deliverables/service.ts
git commit -m "feat(notifications): service, 4 tests, wired into invitation/engagement/deliverable events"
```

---

### Task 7: Notification badge in portal sidebars

**Files:**
- Modify: `app/(client)/layout.tsx`
- Modify: `app/(consultant)/layout.tsx`

Both portal layouts need to fetch the unread count for the current user and show it as a badge. They are Server Components, so we call the DB directly.

- [ ] **Step 1: Read current client layout**

```bash
cat app/\(client\)/layout.tsx
```

- [ ] **Step 2: Update client layout to show notification badge**

The client layout is a Server Component. Import `auth` from Clerk and `countUnread` from notifications. Add a notifications link to the sidebar with a badge.

The full updated `app/(client)/layout.tsx`:

```tsx
import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { SignOutButton } from '@/components/sign-out-button'
import { db } from '@/lib/db'
import { countUnread } from '@/modules/notifications/service'
import type { ReactNode } from 'react'

export default async function ClientLayout({ children }: { children: ReactNode }) {
  await requireRole('client')
  const { userId: clerkId } = await auth()
  let unreadCount = 0
  if (clerkId) {
    const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } })
    if (user) unreadCount = await countUnread(user.id)
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-white border-r border-slate-200 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-slate-900 text-sm tracking-tight border-b border-slate-200">
          Consulten
        </div>
        <nav className="flex-1 px-2 py-3 text-sm space-y-0.5">
          <a href="/projects" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-700 hover:bg-slate-100">Projects</a>
          <a href="/notifications" className="flex items-center justify-between px-3 py-1.5 rounded text-slate-700 hover:bg-slate-100">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold rounded-full bg-indigo-600 text-white">{unreadCount}</span>
            )}
          </a>
        </nav>
        <div className="px-3 py-4 border-t border-slate-200">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
```

Note: the existing client layout already has some nav items (Projects, etc.). Preserve existing items and add the Notifications link. Match the existing sidebar styling exactly.

- [ ] **Step 3: Read and update consultant layout similarly**

```bash
cat app/\(consultant\)/layout.tsx
```

Apply the same pattern: import `countUnread`, look up the user by clerkId, add a Notifications link with badge. Preserve existing nav items (Invitations badge count, Active Engagements link).

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

---

### Task 8: Notification inbox pages

**Files:**
- Create: `app/(client)/notifications/page.tsx`
- Create: `app/(client)/notifications/actions.ts`
- Create: `app/(consultant)/notifications/page.tsx`
- Create: `app/(consultant)/notifications/actions.ts`

- [ ] **Step 1: Create shared markReadAction (client)**

```typescript
// app/(client)/notifications/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { markRead, markAllRead } from '@/modules/notifications/service'
import { redirect } from 'next/navigation'

export async function markReadAction(notificationId: string) {
  await markRead(notificationId)
  redirect('/notifications')
}

export async function markAllReadAction() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return
  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } })
  if (user) await markAllRead(user.id)
  redirect('/notifications')
}
```

- [ ] **Step 2: Create client notifications page**

```typescript
// app/(client)/notifications/page.tsx
import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { listNotifications } from '@/modules/notifications/service'
import { markReadAction, markAllReadAction } from './actions'

export default async function ClientNotificationsPage() {
  await requireRole('client')
  const { userId: clerkId } = await auth()
  const user = clerkId ? await db.user.findUnique({ where: { clerkId }, select: { id: true } }) : null
  const notifications = user ? await listNotifications(user.id) : []
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllReadAction}>
            <button type="submit" className="text-sm text-indigo-600 hover:underline">Mark all read</button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No notifications yet.</div>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => (
            <li key={n.id} className={`bg-white rounded-lg border p-4 flex items-start justify-between gap-4 ${n.read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50'}`}>
              <div className="flex-1">
                <p className="text-sm text-slate-800">{n.body}</p>
                <div className="flex items-center gap-3 mt-1">
                  <a href={n.link} className="text-xs text-indigo-600 hover:underline">View →</a>
                  <span className="text-xs text-slate-400">{n.createdAt.toLocaleString()}</span>
                </div>
              </div>
              {!n.read && (
                <form action={markReadAction.bind(null, n.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Dismiss</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create consultant actions and page (identical pattern)**

```typescript
// app/(consultant)/notifications/actions.ts
'use server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { markRead, markAllRead } from '@/modules/notifications/service'
import { redirect } from 'next/navigation'

export async function markReadAction(notificationId: string) {
  await markRead(notificationId)
  redirect('/notifications')
}

export async function markAllReadAction() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return
  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } })
  if (user) await markAllRead(user.id)
  redirect('/notifications')
}
```

```typescript
// app/(consultant)/notifications/page.tsx
import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { listNotifications } from '@/modules/notifications/service'
import { markReadAction, markAllReadAction } from './actions'

export default async function ConsultantNotificationsPage() {
  await requireRole('consultant')
  const { userId: clerkId } = await auth()
  const user = clerkId ? await db.user.findUnique({ where: { clerkId }, select: { id: true } }) : null
  const notifications = user ? await listNotifications(user.id) : []
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllReadAction}>
            <button type="submit" className="text-sm text-indigo-600 hover:underline">Mark all read</button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No notifications yet.</div>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => (
            <li key={n.id} className={`bg-white rounded-lg border p-4 flex items-start justify-between gap-4 ${n.read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50'}`}>
              <div className="flex-1">
                <p className="text-sm text-slate-800">{n.body}</p>
                <div className="flex items-center gap-3 mt-1">
                  <a href={n.link} className="text-xs text-indigo-600 hover:underline">View →</a>
                  <span className="text-xs text-slate-400">{n.createdAt.toLocaleString()}</span>
                </div>
              </div>
              {!n.read && (
                <form action={markReadAction.bind(null, n.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Dismiss</button>
                </form>
              )}
            </li>
          ))}
        </ul>
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

- [ ] **Step 5: Commit all notification UI**

```bash
git add app/(client)/notifications/ app/(consultant)/notifications/ app/(client)/layout.tsx app/(consultant)/layout.tsx
git commit -m "feat(notifications): in-app inbox + unread badge for client and consultant portals"
```

---

### Task 9: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm test
```

Expected: all tests pass (previous total + 4 new notification tests)

- [ ] **Step 2: Push**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```
