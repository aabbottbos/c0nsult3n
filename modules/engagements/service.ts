import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markEngagementCreated, closeProject } from '@/modules/projects/service'
import type { Role, EngagementStatus } from '@/app/generated/prisma'
import { ENGAGEMENT_TRANSITIONS } from './types'
import { sendProposalSelectedEmail, sendEngagementStartedEmail } from '@/lib/email'

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
  return transition(engagementId, 'ACCEPTED', 'accept', actorId, 'client')
}

export async function closeEngagement(engagementId: string, actorId: string) {
  const eng = await db.engagement.findUniqueOrThrow({ where: { id: engagementId } })
  if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('CLOSED')) throw new Error(`Invalid transition: ${eng.status} → CLOSED`)

  await db.$transaction(async (tx: Tx) => {
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'CLOSED' } })
    await logEvent(tx, { entityType: 'Engagement', entityId: engagementId, action: 'close', actorId, actorRole: 'admin' })
  })

  await closeProject(eng.projectId, actorId)

  return db.engagement.findUniqueOrThrow({ where: { id: engagementId } })
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
