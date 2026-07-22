import type { Role } from '@/app/generated/prisma'

export interface LogEventInput {
  entityType: string
  entityId: string
  action: string
  actorId: string
  actorRole: Role
  data?: Record<string, unknown>
}
