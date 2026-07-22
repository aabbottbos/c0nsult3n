import type { PrismaClient } from '@/app/generated/prisma'
import type { LogEventInput } from './types'

type Tx = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

export async function logEvent(tx: Tx, input: LogEventInput) {
  await tx.eventLog.create({
    data: {
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorId: input.actorId,
      actorRole: input.actorRole,
      data: input.data ?? {},
    },
  })
}
