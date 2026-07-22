import type { InvitationStatus } from '@/app/generated/prisma'

export type { InvitationStatus }

export const INVITATION_TRANSITIONS: Record<InvitationStatus, InvitationStatus[]> = {
  DRAFT: ['SENT', 'WITHDRAWN'],
  SENT: ['VIEWED', 'EXPIRED', 'WITHDRAWN'],
  VIEWED: ['ACCEPTED_INTEREST', 'DECLINED', 'QUESTIONS_ASKED'],
  ACCEPTED_INTEREST: ['PROPOSAL_SUBMITTED', 'WITHDRAWN'],
  DECLINED: [],
  QUESTIONS_ASKED: ['ACCEPTED_INTEREST', 'DECLINED'],
  PROPOSAL_SUBMITTED: [],
  EXPIRED: [],
  WITHDRAWN: [],
}
