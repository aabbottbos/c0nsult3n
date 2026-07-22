import type { ShortlistStatus } from '@/app/generated/prisma'

export type { ShortlistStatus }

export const SHORTLIST_TRANSITIONS: Record<ShortlistStatus, ShortlistStatus[]> = {
  DRAFT: ['ADMIN_REVIEW', 'CLOSED'],
  ADMIN_REVIEW: ['CLIENT_VISIBLE', 'DRAFT'],
  CLIENT_VISIBLE: ['UPDATED', 'CLOSED'],
  UPDATED: ['CLIENT_VISIBLE', 'CLOSED'],
  CLOSED: [],
}
