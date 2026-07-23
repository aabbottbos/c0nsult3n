import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { ConsultantRestriction } from './types'

export async function isEligible(consultantId: string): Promise<{ eligible: boolean; reason?: string }> {
  const now = new Date()
  const activeRestrictions = await db.consultantRestriction.findMany({
    where: {
      consultantId,
      activeFrom: { lte: now },
      OR: [{ activeTo: null }, { activeTo: { gt: now } }],
    },
  })

  if (activeRestrictions.length > 0) {
    const types = activeRestrictions.map((r: ConsultantRestriction) => r.type).join(', ')
    return { eligible: false, reason: `Active restrictions: ${types}` }
  }

  return { eligible: true }
}

export async function addRestriction(
  consultantId: string,
  data: { type: string; notes?: string; activeFrom: Date; activeTo?: Date },
  actorId: string,
): Promise<ConsultantRestriction> {
  return db.$transaction(async (tx: Tx) => {
    const restriction = await tx.consultantRestriction.create({
      data: {
        consultantId,
        type: data.type,
        notes: data.notes,
        activeFrom: data.activeFrom,
        activeTo: data.activeTo,
      },
    })
    await logEvent(tx, {
      entityType: 'ConsultantRestriction',
      entityId: restriction.id,
      action: 'add',
      actorId,
      actorRole: 'admin',
    })
    return restriction
  })
}

export async function listRestrictions(consultantId: string): Promise<ConsultantRestriction[]> {
  return db.consultantRestriction.findMany({
    where: { consultantId },
    orderBy: { activeFrom: 'desc' },
  })
}
