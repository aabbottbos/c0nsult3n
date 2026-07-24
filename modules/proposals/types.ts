import type { ProposalStatus } from '@/app/generated/prisma'

export type { ProposalStatus }

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'],
  PENDING_ADMIN_REVIEW: ['SUBMITTED', 'REJECTED'],
  SUBMITTED: ['SELECTED', 'REJECTED', 'NOT_SELECTED', 'WITHDRAWN'],
  SELECTED: [],
  REJECTED: [],
  NOT_SELECTED: [],
  WITHDRAWN: [],
}
