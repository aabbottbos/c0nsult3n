import type { Prisma } from '@/app/generated/prisma'
import type { Tx } from '@/lib/db'
import type { LogEventInput } from './types'

export async function logEvent(tx: Tx, input: LogEventInput) {
  await tx.eventLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      data: (input.data ?? {}) as unknown as Prisma.InputJsonValue,
    },
  })
}
