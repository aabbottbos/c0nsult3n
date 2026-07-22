import type { ProposalStatus } from '@/app/generated/prisma'

export type { ProposalStatus }

export const PROPOSAL_TRANSITIONS: Record<ProposalStatus, ProposalStatus[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['SELECTED', 'REJECTED'],
  SELECTED: [],
  REJECTED: [],
}
