import type { EngagementStatus } from '@/app/generated/prisma'

export type { EngagementStatus }

export const ENGAGEMENT_TRANSITIONS: Record<EngagementStatus, EngagementStatus[]> = {
  PENDING_START: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['DELIVERABLE_SUBMITTED', 'CANCELLED'],
  DELIVERABLE_SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['REVISION_REQUESTED', 'DISPUTED', 'ACCEPTED'],
  REVISION_REQUESTED: ['IN_PROGRESS', 'CANCELLED'],
  DISPUTED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
}
