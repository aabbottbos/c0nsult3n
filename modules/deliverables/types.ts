import type { DeliverableStatus } from '@/app/generated/prisma'

export type { DeliverableStatus }

export const DELIVERABLE_TRANSITIONS: Record<DeliverableStatus, DeliverableStatus[]> = {
  PENDING: ['SUBMITTED'],
  SUBMITTED: ['ACCEPTED', 'REVISION_REQUESTED'],
  REVISION_REQUESTED: ['SUBMITTED'],
  ACCEPTED: [],
}
