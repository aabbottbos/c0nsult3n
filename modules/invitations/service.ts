import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { Role, InvitationStatus } from '@/app/generated/prisma'
import { INVITATION_TRANSITIONS } from './types'
import { sendInvitationEmail } from '@/lib/email'

async function transition(invitationId: string, to: InvitationStatus, action: string, actorId: string, actorRole: Role) {
  return db.$transaction(async (tx: Tx) => {
    const inv = await tx.consultantInvitation.findUniqueOrThrow({ where: { id: invitationId } })
    if (!INVITATION_TRANSITIONS[inv.status].includes(to)) throw new Error(`Invalid transition: ${inv.status} → ${to}`)
    const updated = await tx.consultantInvitation.update({ where: { id: invitationId }, data: { status: to } })
    await logEvent(tx, { entityType: 'ConsultantInvitation', entityId: invitationId, action, actorId, actorRole })
    return updated
  })
}

export async function createInvitation(
  data: { shortlistCandidateId: string; projectId: string; consultantId: string; expiresAt?: Date },
  actorId: string
) {
  return db.$transaction(async (tx: Tx) => {
    await tx.shortlistCandidate.findUniqueOrThrow({ where: { id: data.shortlistCandidateId } })
    const inv = await tx.consultantInvitation.create({ data: { ...data, status: 'DRAFT' } })
    await logEvent(tx, { entityType: 'ConsultantInvitation', entityId: inv.id, action: 'create', actorId, actorRole: 'admin' })
    return inv
  })
}

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

export async function acceptInterest(invitationId: string, actorId: string) {
  return transition(invitationId, 'ACCEPTED_INTEREST', 'accept_interest', actorId, 'consultant')
}

export async function declineInvitation(invitationId: string, actorId: string) {
  return transition(invitationId, 'DECLINED', 'decline', actorId, 'consultant')
}

export async function markProposalSubmitted(invitationId: string, actorId: string) {
  return transition(invitationId, 'PROPOSAL_SUBMITTED', 'proposal_submitted', actorId, 'consultant')
}

export async function expireInvitation(invitationId: string, actorId: string) {
  return transition(invitationId, 'EXPIRED', 'expire', actorId, 'admin')
}

export async function listInvitations() {
  return db.consultantInvitation.findMany({ orderBy: { createdAt: 'desc' } })
}
