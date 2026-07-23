import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { Role } from '@/app/generated/prisma'

export async function sendMessage(
  engagementId: string,
  senderId: string,
  senderRole: Role,
  messageType: string,
  body: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const message = await tx.engagementCommunication.create({
      data: { engagementId, senderId, senderRole, messageType, body },
    })
    await logEvent(tx, {
      entityType: 'EngagementCommunication',
      entityId: message.id,
      action: 'send',
      actorId: senderId,
      actorRole: senderRole,
    })
    return message
  })
}

export async function listMessages(engagementId: string) {
  return db.engagementCommunication.findMany({
    where: { engagementId },
    orderBy: { createdAt: 'asc' },
  })
}
