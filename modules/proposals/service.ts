import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markProposalSubmitted } from '@/modules/invitations/service'
import { createEngagement } from '@/modules/engagements/service'
import type { Prisma } from '@/app/generated/prisma'

function hasDeviations(deviations: unknown): boolean {
  if (!deviations || typeof deviations !== 'object') return false
  return Object.values(deviations as Record<string, unknown>).some(v => v !== null && v !== undefined && v !== '')
}

export async function createProposal(
  data: { invitationId: string; consultantId: string; fitStatement: string; deviations?: Record<string, unknown> },
  actorId: string
) {
  const deviations = data.deviations ?? {}
  const withDeviations = hasDeviations(deviations)
  const status = withDeviations ? 'PENDING_ADMIN_REVIEW' : 'SUBMITTED'

  const proposal = await db.$transaction(async (tx: Tx) => {
    const p = await tx.proposal.create({
      data: { ...data, deviations: deviations as unknown as Prisma.InputJsonValue, status },
    })
    await logEvent(tx, { entityType: 'Proposal', entityId: p.id, action: 'create', actorId, actorRole: 'consultant' })
    return p
  })

  if (status === 'SUBMITTED') {
    await markProposalSubmitted(data.invitationId, actorId)
  }
  return proposal
}

export async function reviewDeviations(proposalId: string, approved: boolean, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (proposal.status !== 'PENDING_ADMIN_REVIEW') throw new Error(`Cannot review deviations in status ${proposal.status}`)
    const nextStatus = approved ? 'SUBMITTED' : 'REJECTED'
    const updated = await tx.proposal.update({
      where: { id: proposalId },
      data: { status: nextStatus, deviationsApproved: approved, deviationReviewedAt: new Date(), deviationReviewedBy: actorId },
    })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: approved ? 'approve_deviations' : 'reject_deviations', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function withdrawProposal(proposalId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (!['SUBMITTED', 'PENDING_ADMIN_REVIEW'].includes(proposal.status)) throw new Error(`Cannot withdraw proposal in status ${proposal.status}`)
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'WITHDRAWN' } })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: 'withdraw', actorId, actorRole: 'consultant' })
    return updated
  })
}

export async function selectProposal(proposalId: string, actorId: string) {
  const proposal = await db.$transaction(async (tx: Tx) => {
    const p = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (p.status !== 'SUBMITTED') throw new Error(`Cannot select proposal in status ${p.status}`)
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'SELECTED' } })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: 'select', actorId, actorRole: 'client' })
    return updated
  })

  // Load invitation to get projectId
  const invitation = await db.consultantInvitation.findUniqueOrThrow({ where: { id: proposal.invitationId } })

  // Load project to get clientId and approved scope
  const project = await db.project.findUniqueOrThrow({ where: { id: invitation.projectId } })
  const scope = await db.scope.findFirstOrThrow({
    where: { projectId: invitation.projectId, status: 'CLIENT_CONFIRMED' },
  })

  // Create engagement
  await createEngagement(
    { projectId: invitation.projectId, scopeId: scope.id, proposalId, consultantId: proposal.consultantId, clientId: project.clientId },
    actorId
  )

  // Mark all other SUBMITTED/PENDING_ADMIN_REVIEW proposals for this project as NOT_SELECTED
  const otherProposals = await db.proposal.findMany({
    where: {
      id: { not: proposalId },
      status: { in: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'] },
      invitation: { projectId: invitation.projectId },
    },
  })
  for (const other of otherProposals) {
    await db.$transaction(async (tx: Tx) => {
      await tx.proposal.update({ where: { id: other.id }, data: { status: 'NOT_SELECTED' } })
      await logEvent(tx, { entityType: 'Proposal', entityId: other.id, action: 'not_selected', actorId, actorRole: 'client' })
    })
  }

  return proposal
}

export async function listProposals() {
  return db.proposal.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getProposal(id: string) {
  return db.proposal.findUnique({ where: { id } })
}
