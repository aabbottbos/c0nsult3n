# Email Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send plain-text transactional emails via Resend at four workflow trigger points: invitation sent, proposal selected (consultant), engagement started (client), deliverable submitted (client).

**Architecture:** A single `lib/email.ts` module wraps the Resend SDK and exports one function per trigger. Each function is fire-and-forget — it catches errors and logs them but never throws, so email failure never blocks a state transition. Emails are triggered by calling these functions immediately after the relevant service calls in three service files.

**Tech Stack:** Resend (`resend` npm package), plain text emails, `RESEND_API_KEY` env var.

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/email.ts` | Create | Resend wrapper + 4 send functions |
| `modules/invitations/service.ts` | Modify | Call `sendInvitationEmail` after `sendInvitation` |
| `modules/engagements/service.ts` | Modify | Call `sendProposalSelectedEmail` + `sendEngagementStartedEmail` after `createEngagement` |
| `app/(consultant)/engagements/actions.ts` | Modify | Call `sendDeliverableSubmittedEmail` after `submitDeliverable` |
| `.env.local` | Modify | Add `RESEND_API_KEY` |

---

## Task 1: Install Resend and create `lib/email.ts`

**Files:**
- Create: `lib/email.ts`

- [ ] **Step 1: Install resend**

```bash
npm install resend
```

Expected: `resend` appears in `package.json` dependencies.

- [ ] **Step 2: Add `RESEND_API_KEY` to `.env.local`**

Add this line to `.env.local` (get key from resend.com dashboard):
```
RESEND_API_KEY=re_your_key_here
```

- [ ] **Step 3: Create `lib/email.ts`**

```typescript
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = 'Consulten <noreply@consulten.co>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

async function send(to: string, subject: string, text: string) {
  try {
    await resend.emails.send({ from: FROM, to, subject, text })
  } catch (err) {
    console.error('[email] Failed to send:', subject, 'to', to, err)
  }
}

export async function sendInvitationEmail(opts: {
  consultantEmail: string
  consultantName: string
  projectTitle: string
  invitationId: string
  expiresAt: Date | null
}) {
  const expiry = opts.expiresAt ? opts.expiresAt.toLocaleDateString() : 'no expiry set'
  await send(
    opts.consultantEmail,
    "You've been invited to a project on Consulten",
    `Hi ${opts.consultantName},

You have a new project invitation waiting for you on Consulten.

Project: ${opts.projectTitle}
Expires: ${expiry}

Log in to review the scope and respond:
${APP_URL}/invitations/${opts.invitationId}

— The Consulten Team`
  )
}

export async function sendProposalSelectedEmail(opts: {
  consultantEmail: string
  consultantName: string
  projectTitle: string
  engagementId: string
}) {
  await send(
    opts.consultantEmail,
    'Your proposal was selected',
    `Hi ${opts.consultantName},

Your proposal has been selected for ${opts.projectTitle}. An engagement has been created.

Log in to get started:
${APP_URL}/engagements/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendEngagementStartedEmail(opts: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectId: string
}) {
  await send(
    opts.clientEmail,
    'Your engagement has started',
    `Hi ${opts.clientName},

A consultant has been selected for ${opts.projectTitle} and your engagement is now active.

Log in to track progress:
${APP_URL}/projects/${opts.projectId}

— The Consulten Team`
  )
}

export async function sendDeliverableSubmittedEmail(opts: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectId: string
  engagementId: string
}) {
  await send(
    opts.clientEmail,
    'A deliverable has been submitted for your review',
    `Hi ${opts.clientName},

A deliverable has been submitted for ${opts.projectTitle} and is ready for your review.

Log in to accept or request a revision:
${APP_URL}/projects/${opts.projectId}/engagement/${opts.engagementId}

— The Consulten Team`
  )
}
```

- [ ] **Step 4: Add `NEXT_PUBLIC_APP_URL` to `.env.local`**

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

- [ ] **Step 5: Commit**

```bash
git add lib/email.ts package.json package-lock.json .env.local
git commit -m "feat: add email module with Resend (4 send functions)"
```

---

## Task 2: Wire invitation email

**Files:**
- Modify: `modules/invitations/service.ts`

- [ ] **Step 1: Add import to `modules/invitations/service.ts`**

At the top of the file, after existing imports:
```typescript
import { sendInvitationEmail } from '@/lib/email'
```

- [ ] **Step 2: Update `sendInvitation` to fire email after transition**

Replace the existing `sendInvitation` function:
```typescript
export async function sendInvitation(invitationId: string, actorId: string) {
  const updated = await db.$transaction(async (tx: Tx) => {
    const inv = await tx.consultantInvitation.findUniqueOrThrow({ where: { id: invitationId } })
    if (!INVITATION_TRANSITIONS[inv.status].includes('SENT')) throw new Error(`Invalid transition: ${inv.status} → SENT`)
    const result = await tx.consultantInvitation.update({ where: { id: invitationId }, data: { status: 'SENT', sentAt: new Date() } })
    await logEvent(tx, { entityType: 'ConsultantInvitation', entityId: invitationId, action: 'send', actorId, actorRole: 'admin' })
    return result
  })

  // Fire email after transaction commits — failure must not roll back state
  const inv = await db.consultantInvitation.findUniqueOrThrow({
    where: { id: invitationId },
    include: {
      consultant: { include: { user: true } },
      project: true,
    },
  })
  await sendInvitationEmail({
    consultantEmail: inv.consultant.user.email,
    consultantName: inv.consultant.user.email,
    projectTitle: inv.project.title,
    invitationId: inv.id,
    expiresAt: inv.expiresAt,
  })

  return updated
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/invitations/service.ts
git commit -m "feat: send email when invitation is sent to consultant"
```

---

## Task 3: Wire proposal-selected and engagement-started emails

**Files:**
- Modify: `modules/engagements/service.ts`

- [ ] **Step 1: Add imports to `modules/engagements/service.ts`**

After existing imports:
```typescript
import { sendProposalSelectedEmail, sendEngagementStartedEmail } from '@/lib/email'
```

- [ ] **Step 2: Update `createEngagement` to fire emails**

Replace the existing `createEngagement` function:
```typescript
export async function createEngagement(
  data: { projectId: string; scopeId: string; proposalId: string; consultantId: string; clientId: string },
  actorId: string
) {
  const engagement = await db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.create({ data })
    await logEvent(tx, { entityType: 'Engagement', entityId: eng.id, action: 'create', actorId, actorRole: 'admin' })
    return eng
  })
  await markEngagementCreated(data.projectId, actorId)

  // Fire emails after transaction — failure must not roll back state
  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagement.id },
    include: {
      consultant: { include: { user: true } },
      project: {
        include: {
          client: { include: { contacts: true } },
        },
      },
    },
  })

  const clientContact = eng.project.client.contacts[0]

  await sendProposalSelectedEmail({
    consultantEmail: eng.consultant.user.email,
    consultantName: eng.consultant.user.email,
    projectTitle: eng.project.title,
    engagementId: eng.id,
  })

  if (clientContact) {
    await sendEngagementStartedEmail({
      clientEmail: clientContact.user.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.project.id,
    })
  }

  return engagement
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add modules/engagements/service.ts
git commit -m "feat: send emails when engagement is created (consultant + client)"
```

---

## Task 4: Wire deliverable-submitted email

**Files:**
- Modify: `app/(consultant)/engagements/actions.ts`

- [ ] **Step 1: Add import to `app/(consultant)/engagements/actions.ts`**

After existing imports:
```typescript
import { sendDeliverableSubmittedEmail } from '@/lib/email'
```

- [ ] **Step 2: Update `submitDeliverableAction` to fire email**

Replace the existing `submitDeliverableAction` function:
```typescript
export async function submitDeliverableAction(engagementId: string, formData: FormData) {
  const profileId = await consultantProfileId()
  const fileUrl = formData.get('fileUrl') as string

  let deliverableId: string

  await db.$transaction(async (tx) => {
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl: fileUrl || null },
    })
    deliverableId = d.id
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
      clientEmail: clientContact.user.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.projectId,
      engagementId: eng.id,
    })
  }

  redirect(`/engagements/${engagementId}`)
}
```

- [ ] **Step 3: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(consultant)/engagements/actions.ts"
git commit -m "feat: send email to client when deliverable is submitted"
```

---

## Task 5: Add env var and verify end-to-end

- [ ] **Step 1: Add `NEXT_PUBLIC_APP_URL` to Vercel env vars**

```bash
vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://your-production-domain.vercel.app

vercel env add RESEND_API_KEY production
# Enter: your Resend API key
```

- [ ] **Step 2: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: typecheck clean, 9/9 tests pass.

- [ ] **Step 3: Smoke test locally**

1. Start dev server: `npm run dev`
2. Sign in as admin → send an invitation to the consultant
3. Check Resend dashboard → Logs — confirm email was delivered
4. Sign in as admin → create an engagement (select a proposal)
5. Check Resend dashboard — confirm two emails: consultant (proposal selected) + client (engagement started)
6. Sign in as consultant → submit a deliverable
7. Check Resend dashboard — confirm client received deliverable email

- [ ] **Step 4: Push to GitHub**

```bash
cd /Users/andrewabbott/Development
git subtree push --prefix=Personal/Consulten/build consulten main
```
