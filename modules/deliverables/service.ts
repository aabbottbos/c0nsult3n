import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'

export async function createDeliverable(engagementId: string, actorId: string) {
  return db.$transaction(async (tx) => {
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
