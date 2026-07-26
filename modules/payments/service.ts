import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { PaymentStatus, PayoutStatus } from '@/app/generated/prisma'

export async function createPaymentRecord(engagementId: string, amount: number, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const record = await tx.paymentTransactionRecord.create({
      data: { engagementId, amount },
    })
    await logEvent(tx, { entityType: 'PaymentTransactionRecord', entityId: record.id, action: 'create', actorId, actorRole: 'admin' })
    return record
  })
}

export async function updatePaymentStatus(
  engagementId: string,
  paymentStatus: PaymentStatus,
  payoutStatus: PayoutStatus,
  adminNotes: string | null,
  actorId: string,
) {
  return db.$transaction(async (tx: Tx) => {
    const record = await tx.paymentTransactionRecord.update({
      where: { engagementId },
      data: { paymentStatus, payoutStatus, adminNotes },
    })
    await logEvent(tx, { entityType: 'PaymentTransactionRecord', entityId: record.id, action: 'update_status', actorId, actorRole: 'admin' })
    return record
  })
}

export async function getPaymentRecord(engagementId: string) {
  return db.paymentTransactionRecord.findUnique({ where: { engagementId } })
}
