import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markEngagementCreated, closeProject } from '@/modules/projects/service'
import type { Role, EngagementStatus } from '@/app/generated/prisma'
import { ENGAGEMENT_TRANSITIONS } from './types'
import { sendProposalSelectedEmail, sendEngagementStartedEmail, sendEngagementClosedEmail } from '@/lib/email'
import { createNotification } from '@/modules/notifications/service'

async function transition(engagementId: string, to: EngagementStatus, action: string, actorId: string, actorRole: Role) {
  return db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes(to)) throw new Error(`Invalid transition: ${eng.status} → ${to}`)
    const updated = await tx.engagement.update({ where: { id: engagementId }, data: { status: to } })
    await logEvent(tx, { entityType: 'Engagement', entityId: engagementId, action, actorId, actorRole })
    return updated
  })
}

export async function createEngagement(
  data: { projectId: string; scopeId: string; proposalId: string; consultantId: string; clientContactId: string },
  actorId: string
) {
  const engagement = await db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.create({ data })
    await logEvent(tx, { entityType: 'Engagement', entityId: eng.id, action: 'create', actorId, actorRole: 'admin' })
    return eng
  })
  await markEngagementCreated(data.projectId, actorId)

  // Auto-create payment record using scope fee
  const scope = await db.scope.findUniqueOrThrow({ where: { id: data.scopeId } })
  const { createPaymentRecord } = await import('@/modules/payments/service')
  await createPaymentRecord(engagement.id, Number(scope.fee), actorId)

  // Fire emails after transaction
  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagement.id },
    include: {
      consultant: { include: { user: true } },
      clientContact: { include: { user: true } },
      project: true,
    },
  })

  const clientContact = eng.clientContact

  await sendProposalSelectedEmail({
    consultantEmail: eng.consultant.user.email,
    consultantName: eng.consultant.user.email,
    projectTitle: eng.project.title,
    engagementId: eng.id,
  })
  await createNotification({
    recipientId: eng.consultant.user.id,
    type: 'PROPOSAL_SELECTED',
    body: `Your proposal was selected for ${eng.project.title}.`,
    link: `/engagements/${eng.id}`,
  })

  if (clientContact) {
    await sendEngagementStartedEmail({
      clientEmail: clientContact.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.project.id,
    })
    if (clientContact.userId) {
      await createNotification({
        recipientId: clientContact.userId,
        type: 'ENGAGEMENT_STARTED',
        body: `Your engagement for ${eng.project.title} has started.`,
        link: `/projects/${eng.project.id}/engagement/${eng.id}`,
      })
    }
  }

  return engagement
}

export async function startEngagement(engagementId: string, actorId: string) {
  return transition(engagementId, 'IN_PROGRESS', 'start', actorId, 'admin')
}

export async function submitDeliverable(engagementId: string, actorId: string) {
  return transition(engagementId, 'DELIVERABLE_SUBMITTED', 'submit_deliverable', actorId, 'consultant')
}

export async function beginReview(engagementId: string, actorId: string) {
  return transition(engagementId, 'UNDER_REVIEW', 'begin_review', actorId, 'admin')
}

export async function requestRevision(engagementId: string, actorId: string) {
  return transition(engagementId, 'REVISION_REQUESTED', 'request_revision', actorId, 'client')
}

export async function acceptEngagement(engagementId: string, actorId: string) {
  const latestDeliverable = await db.deliverable.findFirst({
    where: { engagementId },
    orderBy: { createdAt: 'desc' },
  })
  if (latestDeliverable?.aiQaRiskFlag) {
    const openTask = await db.adminTask.findFirst({
      where: { engagementId, deliverableId: latestDeliverable.id, resolved: false },
    })
    if (openTask) throw new Error('Acceptance blocked: AI QA risk flag requires admin review')
  }
  const openDispute = await db.dispute.findFirst({
    where: { engagementId, adminReviewStatus: { in: ['OPENED', 'UNDER_ADMIN_REVIEW', 'PROPOSED_RESOLUTION'] } },
  })
  if (openDispute) throw new Error('Acceptance blocked: open dispute must be resolved first')
  return transition(engagementId, 'ACCEPTED', 'accept', actorId, 'client')
}

export async function resolveAdminTask(adminTaskId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const task = await tx.adminTask.update({ where: { id: adminTaskId }, data: { resolved: true } })
    await logEvent(tx, { entityType: 'AdminTask', entityId: adminTaskId, action: 'resolve', actorId, actorRole: 'admin' })
    return task
  })
}

export async function closeEngagement(engagementId: string, actorId: string) {
  const eng = await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })
  if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('CLOSED')) throw new Error(`Invalid transition: ${eng.status} → CLOSED`)

  await db.$transaction(async (tx: Tx) => {
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'CLOSED' } })
    await logEvent(tx, { entityType: 'Engagement', entityId: engagementId, action: 'close', actorId, actorRole: 'admin' })
  })

  await closeProject(eng.projectId, actorId)

  const full = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      consultant: { include: { user: true } },
      clientContact: true,
      project: true,
    },
  })

  if (full.clientContact) {
    await sendEngagementClosedEmail({
      email: full.clientContact.email,
      name: full.clientContact.name,
      projectTitle: full.project.title,
      engagementId,
      projectId: full.projectId,
      role: 'client',
    })
    if (full.clientContact.userId) {
      await createNotification({
        recipientId: full.clientContact.userId,
        type: 'ENGAGEMENT_CLOSED',
        body: `Your engagement for ${full.project.title} has been closed.`,
        link: `/projects/${full.projectId}/engagement/${engagementId}`,
      })
    }
  }
  await sendEngagementClosedEmail({
    email: full.consultant.user.email,
    name: full.consultant.user.email,
    projectTitle: full.project.title,
    engagementId,
    projectId: full.projectId,
    role: 'consultant',
  })
  await createNotification({
    recipientId: full.consultant.user.id,
    type: 'ENGAGEMENT_CLOSED',
    body: `Your engagement for ${full.project.title} has been closed.`,
    link: `/engagements/${engagementId}`,
  })

  return full
}

export async function cancelEngagement(engagementId: string, actorId: string) {
  return transition(engagementId, 'CANCELLED', 'cancel', actorId, 'admin')
}

export async function listEngagements() {
  return db.engagement.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getEngagement(id: string) {
  return db.engagement.findUnique({ where: { id }, include: { deliverables: true } })
}
