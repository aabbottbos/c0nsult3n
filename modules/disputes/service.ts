import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { callClaude } from '@/lib/ai'
import { ENGAGEMENT_TRANSITIONS } from '@/modules/engagements/types'

export async function openDispute(engagementId: string, openedBy: string, disputeReason: string) {
  return db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('DISPUTED')) {
      throw new Error(`Cannot open dispute: engagement is ${eng.status}`)
    }
    const dispute = await tx.dispute.create({
      data: { engagementId, openedBy, disputeReason, adminReviewStatus: 'OPENED' },
    })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'DISPUTED' } })
    await logEvent(tx, { entityType: 'Dispute', entityId: dispute.id, action: 'open', actorId: openedBy, actorRole: 'admin' })
    return dispute
  })
}

export async function generateAiDisputeSummary(disputeId: string, actorId: string) {
  const dispute = await db.dispute.findUniqueOrThrow({
    where: { id: disputeId },
    include: {
      engagement: {
        include: {
          communications: { orderBy: { createdAt: 'asc' } },
          deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
          scope: true,
        },
      },
    },
  })

  const commsText = dispute.engagement.communications
    .map(c => `[${c.senderRole}/${c.messageType}] ${c.body}`)
    .join('\n')
  const latestDeliverable = dispute.engagement.deliverables[0]
  const deliverableText = latestDeliverable
    ? `Deliverable notes: ${latestDeliverable.consultantNotes ?? '(none)'}\nAI QA notes: ${latestDeliverable.aiQaNotes ?? '(none)'}`
    : 'No deliverable submitted.'

  const system = `You are an impartial dispute reviewer for a professional consulting platform.
Summarize the facts of this dispute in 2–4 sentences. Be factual and neutral. Do not recommend outcomes.`

  const prompt = `Dispute reason: ${dispute.disputeReason}

Engagement scope: ${dispute.engagement.scope.deliverable}
Acceptance criteria: ${dispute.engagement.scope.acceptanceCriteria}

${deliverableText}

Communication thread:
${commsText || '(no communications)'}`

  let summary = 'AI summary could not be generated. Manual review recommended.'
  try {
    summary = await callClaude(system, prompt)
  } catch {
    // fire-and-forget pattern — store fallback
  }

  await db.$transaction(async (tx: Tx) => {
    await tx.dispute.update({ where: { id: disputeId }, data: { aiDisputeSummary: summary } })
    await tx.aIOutputLog.create({
      data: {
        touchpoint: 'dispute_summary',
        promptVersion: '1',
        model: 'claude-sonnet-4-6',
        inputSummary: `dispute:${disputeId}`,
        output: summary,
        exposed: false,
        reviewed: false,
      },
    })
    await logEvent(tx, { entityType: 'Dispute', entityId: disputeId, action: 'ai_summary', actorId, actorRole: 'admin' })
  })

  return summary
}

export async function resolveDispute(
  disputeId: string,
  proposedResolution: string,
  outcome: 'ACCEPTED' | 'REVISION_REQUESTED' | 'CANCELLED',
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const dispute = await tx.dispute.findUniqueOrThrow({ where: { id: disputeId } })
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: dispute.engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes(outcome)) {
      throw new Error(`Cannot resolve dispute: engagement ${eng.status} → ${outcome} is invalid`)
    }
    await tx.engagement.update({ where: { id: dispute.engagementId }, data: { status: outcome } })
    const resolved = await tx.dispute.update({
      where: { id: disputeId },
      data: {
        proposedResolution,
        finalResolution: proposedResolution,
        resultingStatus: outcome,
        adminReviewStatus: 'CLOSED',
        closedAt: new Date(),
      },
    })
    await logEvent(tx, { entityType: 'Dispute', entityId: disputeId, action: `resolve_${outcome.toLowerCase()}`, actorId, actorRole: 'admin' })
    return resolved
  })
}

export async function listDisputes() {
  return db.dispute.findMany({
    where: { adminReviewStatus: { not: 'CLOSED' } },
    include: { engagement: { include: { project: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getDispute(id: string) {
  return db.dispute.findUnique({
    where: { id },
    include: {
      engagement: {
        include: {
          project: true,
          scope: true,
          communications: { orderBy: { createdAt: 'asc' } },
          deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      },
    },
  })
}
