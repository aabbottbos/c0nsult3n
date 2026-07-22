import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markScopeApproved } from '@/modules/projects/service'
import type { Role, ScopeStatus } from '@/app/generated/prisma'
import { SCOPE_TRANSITIONS } from './types'

async function transition(scopeId: string, to: ScopeStatus, action: string, actorId: string, actorRole: Role) {
  return db.$transaction(async (tx) => {
    const scope = await tx.scope.findUniqueOrThrow({ where: { id: scopeId } })
    const allowed = SCOPE_TRANSITIONS[scope.status]
    if (!allowed.includes(to)) throw new Error(`Invalid transition: ${scope.status} → ${to}`)
    const updated = await tx.scope.update({ where: { id: scopeId }, data: { status: to } })
    await logEvent(tx, { entityType: 'Scope', entityId: scopeId, action, actorId, actorRole })
    return updated
  })
}

export async function createScope(
  data: {
    projectId: string
    deliverable: string
    acceptanceCriteria: string
    assumptions: string
    exclusions: string
    dueDate: Date
    fee: number
    effortCapHours: number
  },
  actorId: string
) {
  return db.$transaction(async (tx) => {
    const scope = await tx.scope.create({ data: { ...data, status: 'AI_DRAFTED' } })
    await logEvent(tx, { entityType: 'Scope', entityId: scope.id, action: 'create', actorId, actorRole: 'admin' })
    return scope
  })
}

export async function moveToAdminReview(scopeId: string, actorId: string) {
  return transition(scopeId, 'ADMIN_REVIEW', 'move_to_admin_review', actorId, 'admin')
}

export async function approveScope(scopeId: string, actorId: string) {
  const scope = await db.scope.findUniqueOrThrow({ where: { id: scopeId } })
  const allowed = SCOPE_TRANSITIONS[scope.status]
  if (!allowed.includes('ADMIN_APPROVED')) throw new Error(`Invalid transition: ${scope.status} → ADMIN_APPROVED`)

  await db.$transaction(async (tx) => {
    await tx.scope.update({ where: { id: scopeId }, data: { status: 'ADMIN_APPROVED' } })
    await logEvent(tx, { entityType: 'Scope', entityId: scopeId, action: 'approve', actorId, actorRole: 'admin' })
  })

  // advance the project (separate transaction — markScopeApproved manages its own)
  await markScopeApproved(scope.projectId, actorId)

  return db.scope.findUniqueOrThrow({ where: { id: scopeId } })
}

export async function requestClientChanges(scopeId: string, actorId: string) {
  return transition(scopeId, 'CLIENT_CHANGE_REQUESTED', 'request_client_changes', actorId, 'admin')
}

export async function confirmScope(scopeId: string, actorId: string) {
  return transition(scopeId, 'CLIENT_CONFIRMED', 'confirm', actorId, 'client')
}

export async function rejectScope(scopeId: string, actorId: string) {
  return transition(scopeId, 'REJECTED', 'reject', actorId, 'admin')
}

export async function getScope(id: string) {
  return db.scope.findUnique({ where: { id } })
}
