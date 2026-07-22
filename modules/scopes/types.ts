import type { ScopeStatus } from '@/app/generated/prisma'

export type { ScopeStatus }

export const SCOPE_TRANSITIONS: Record<ScopeStatus, ScopeStatus[]> = {
  NOT_STARTED: ['AI_DRAFTED'],
  AI_DRAFTED: ['ADMIN_REVIEW'],
  ADMIN_REVIEW: ['ADMIN_APPROVED', 'CLIENT_CHANGE_REQUESTED', 'REJECTED'],
  ADMIN_APPROVED: ['CLIENT_CONFIRMED', 'CLIENT_CHANGE_REQUESTED'],
  CLIENT_CHANGE_REQUESTED: ['ADMIN_REVIEW'],
  CLIENT_CONFIRMED: [],
  REJECTED: [],
}
