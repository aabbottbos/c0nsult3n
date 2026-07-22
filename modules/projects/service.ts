import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { Role, ProjectStatus } from '@/app/generated/prisma'
import { PROJECT_TRANSITIONS } from './types'

async function transition(projectId: string, to: ProjectStatus, action: string, actorId: string, actorRole: Role) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } })
    const allowed = PROJECT_TRANSITIONS[project.status]
    if (!allowed.includes(to)) throw new Error(`Invalid transition: ${project.status} → ${to}`)
    const updated = await tx.project.update({ where: { id: projectId }, data: { status: to } })
    await logEvent(tx, { entityType: 'Project', entityId: projectId, action, actorId, actorRole })
    return updated
  })
}

export async function createProject(
  data: { clientId: string; title: string; description: string },
  actorId: string
) {
  return db.$transaction(async (tx) => {
    const project = await tx.project.create({ data })
    await logEvent(tx, { entityType: 'Project', entityId: project.id, action: 'create', actorId, actorRole: 'admin' })
    return project
  })
}

export async function submitProject(projectId: string, actorId: string) {
  return transition(projectId, 'SUBMITTED', 'submit', actorId, 'client')
}

export async function startAdminReview(projectId: string, actorId: string) {
  return transition(projectId, 'UNDER_ADMIN_REVIEW', 'start_admin_review', actorId, 'admin')
}

export async function markScopeApproved(projectId: string, actorId: string) {
  return transition(projectId, 'SCOPE_APPROVED', 'scope_approved', actorId, 'admin')
}

export async function markNeedsClarification(projectId: string, actorId: string) {
  return transition(projectId, 'NEEDS_CLARIFICATION', 'needs_clarification', actorId, 'admin')
}

export async function markReadyForMatching(projectId: string, actorId: string) {
  return transition(projectId, 'READY_FOR_MATCHING', 'ready_for_matching', actorId, 'admin')
}

export async function markMatchingInProgress(projectId: string, actorId: string) {
  return transition(projectId, 'MATCHING_IN_PROGRESS', 'matching_in_progress', actorId, 'admin')
}

export async function markShortlistReady(projectId: string, actorId: string) {
  return transition(projectId, 'SHORTLIST_READY', 'shortlist_ready', actorId, 'admin')
}

export async function markEngagementCreated(projectId: string, actorId: string) {
  return transition(projectId, 'ENGAGEMENT_CREATED', 'engagement_created', actorId, 'admin')
}

export async function closeProject(projectId: string, actorId: string) {
  return transition(projectId, 'CLOSED', 'close', actorId, 'admin')
}

export async function cancelProject(projectId: string, actorId: string) {
  return transition(projectId, 'CANCELLED', 'cancel', actorId, 'admin')
}

export async function listProjects() {
  return db.project.findMany({ orderBy: { createdAt: 'desc' }, include: { client: true } })
}

export async function getProject(id: string) {
  return db.project.findUnique({ where: { id }, include: { client: true, scope: true, shortlist: true, engagements: true } })
}
