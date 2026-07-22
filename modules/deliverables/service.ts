import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'

export async function createDeliverable(engagementId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const deliverable = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date() },
    })
    await logEvent(tx, { entityType: 'Deliverable', entityId: deliverable.id, action: 'create', actorId, actorRole: 'consultant' })
    return deliverable
  })
}

export async function getDeliverable(id: string) {
  return db.deliverable.findUnique({ where: { id } })
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

export async function listRevisionRequests(engagementId: string) {
  return db.revisionRequest.findMany({ where: { engagementId } })
}
