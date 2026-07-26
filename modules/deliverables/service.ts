import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { callClaude } from '@/lib/ai'
import { ENGAGEMENT_TRANSITIONS } from '@/modules/engagements/types'
import type { Role } from '@/app/generated/prisma'

export async function submitDeliverable(
  engagementId: string,
  fileUrl: string | null,
  consultantNotes: string,
  actorId: string,
) {
  const deliverable = await db.$transaction(async (tx: Tx) => {
    const eng = await tx.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    if (!ENGAGEMENT_TRANSITIONS[eng.status].includes('DELIVERABLE_SUBMITTED')) {
      throw new Error(`Invalid transition: ${eng.status} → DELIVERABLE_SUBMITTED`)
    }
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl, consultantNotes },
    })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'DELIVERABLE_SUBMITTED' } })
    await logEvent(tx, { entityType: 'Deliverable', entityId: d.id, action: 'submit', actorId, actorRole: 'consultant' })
    return d
  })
  return deliverable
}

export async function resubmitDeliverable(
  engagementId: string,
  revisionRequestId: string,
  fileUrl: string | null,
  consultantNotes: string,
  actorId: string,
) {
  const deliverable = await db.$transaction(async (tx: Tx) => {
    await tx.revisionRequest.update({ where: { id: revisionRequestId }, data: { status: 'ADDRESSED' } })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'IN_PROGRESS' } })
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl, consultantNotes, revisionRequestId },
    })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'DELIVERABLE_SUBMITTED' } })
    await logEvent(tx, { entityType: 'Deliverable', entityId: d.id, action: 'resubmit', actorId, actorRole: 'consultant' })
    return d
  })
  return deliverable
}

export async function runAiQa(deliverableId: string, actorId: string) {
  const deliverable = await db.deliverable.findUniqueOrThrow({
    where: { id: deliverableId },
    include: { engagement: { include: { scope: true } } },
  })
  const scope = deliverable.engagement.scope
  const engagementId = deliverable.engagementId

  const system = `You are a QA reviewer for professional consulting deliverables.
Compare the consultant's submitted work against the scope and acceptance criteria.
Respond with ONLY valid JSON in this exact format: {"notes": "...", "riskFlag": false}
riskFlag should be true only if there are significant concerns about whether the deliverable meets the acceptance criteria.`

  const prompt = `Scope deliverable: ${scope.deliverable}
Acceptance criteria: ${scope.acceptanceCriteria}
Consultant notes / work summary: ${deliverable.consultantNotes ?? '(no notes provided)'}`

  let notes = 'AI QA review complete.'
  let riskFlag = false
  try {
    const raw = await callClaude(system, prompt)
    const parsed = JSON.parse(raw)
    notes = typeof parsed.notes === 'string' ? parsed.notes : notes
    riskFlag = parsed.riskFlag === true
  } catch {
    notes = 'AI QA review could not be parsed. Manual review recommended.'
    riskFlag = true
  }

  await db.$transaction(async (tx: Tx) => {
    await tx.deliverable.update({
      where: { id: deliverableId },
      data: { aiQaNotes: notes, aiQaRiskFlag: riskFlag, aiQaRunAt: new Date() },
    })
    await tx.engagement.update({ where: { id: engagementId }, data: { status: 'UNDER_REVIEW' } })
    await tx.aIOutputLog.create({
      data: {
        touchpoint: 'deliverable_qa',
        promptVersion: '1',
        model: 'claude-sonnet-4-6',
        inputSummary: `deliverable:${deliverableId}`,
        output: notes,
        exposed: true,
        reviewed: false,
      },
    })
    if (riskFlag) {
      await tx.adminTask.create({
        data: { engagementId, deliverableId, reason: 'AI QA risk flag' },
      })
    }
    await logEvent(tx, { entityType: 'Deliverable', entityId: deliverableId, action: 'ai_qa', actorId, actorRole: 'admin' })
  })
}

export async function createFeedback(
  engagementId: string,
  submittedBy: string,
  role: Role,
  satisfaction: number,
  repeatIntent: boolean,
  comments: string | null,
) {
  return db.feedback.upsert({
    where: { engagementId_submittedBy: { engagementId, submittedBy } },
    update: { satisfaction, repeatIntent, comments },
    create: { engagementId, submittedBy, role, satisfaction, repeatIntent, comments },
  })
}

export async function createRevisionRequest(
  engagementId: string,
  deliverableId: string,
  reason: string,
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const revisionRequest = await tx.revisionRequest.create({
      data: { engagementId, deliverableId, reason, requestedBy: actorId, status: 'OPEN' },
    })
    await logEvent(tx, { entityType: 'RevisionRequest', entityId: revisionRequest.id, action: 'create', actorId, actorRole: 'client' })
    return revisionRequest
  })
}

export async function addressRevisionRequest(revisionRequestId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const revisionRequest = await tx.revisionRequest.update({
      where: { id: revisionRequestId },
      data: { status: 'ADDRESSED' },
    })
    await logEvent(tx, { entityType: 'RevisionRequest', entityId: revisionRequest.id, action: 'address', actorId, actorRole: 'consultant' })
    return revisionRequest
  })
}

export async function withdrawRevisionRequest(revisionRequestId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const revisionRequest = await tx.revisionRequest.update({
      where: { id: revisionRequestId },
      data: { status: 'WITHDRAWN' },
    })
    await logEvent(tx, { entityType: 'RevisionRequest', entityId: revisionRequest.id, action: 'withdraw', actorId, actorRole: 'client' })
    return revisionRequest
  })
}

export async function updateRevisionRequest(
  revisionRequestId: string,
  data: { inScopeConfirmation?: boolean; dueDate?: Date | null },
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const updated = await tx.revisionRequest.update({ where: { id: revisionRequestId }, data })
    await logEvent(tx, { entityType: 'RevisionRequest', entityId: revisionRequestId, action: 'update', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function listRevisionRequests(engagementId: string) {
  return db.revisionRequest.findMany({ where: { engagementId } })
}

export async function getDeliverable(id: string) {
  return db.deliverable.findUnique({ where: { id } })
}
