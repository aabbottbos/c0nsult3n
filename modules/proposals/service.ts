import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markProposalSubmitted } from '@/modules/invitations/service'

export async function createProposal(
  data: { invitationId: string; consultantId: string; fitStatement: string; deviations?: Record<string, unknown> },
  actorId: string
) {
  const proposal = await db.$transaction(async (tx) => {
    const p = await tx.proposal.create({
      data: { ...data, deviations: data.deviations ?? {}, status: 'SUBMITTED' },
    })
    await logEvent(tx, { entityType: 'Proposal', entityId: p.id, action: 'create', actorId, actorRole: 'consultant' })
    return p
  })
  await markProposalSubmitted(data.invitationId, actorId)
  return proposal
}

export async function selectProposal(proposalId: string, actorId: string) {
  return db.$transaction(async (tx) => {
    const proposal = await tx.proposal.findUniqueOrThrow({ where: { id: proposalId } })
    if (proposal.status !== 'SUBMITTED') throw new Error(`Cannot select proposal in status ${proposal.status}`)
    const updated = await tx.proposal.update({ where: { id: proposalId }, data: { status: 'SELECTED' } })
    await logEvent(tx, { entityType: 'Proposal', entityId: proposalId, action: 'select', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function listProposals() {
  return db.proposal.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getProposal(id: string) {
  return db.proposal.findUnique({ where: { id } })
}
