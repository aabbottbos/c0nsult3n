import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { markShortlistReady } from '@/modules/projects/service'
import type { Role, ShortlistStatus } from '@/app/generated/prisma'
import { SHORTLIST_TRANSITIONS } from './types'

async function transition(shortlistId: string, to: ShortlistStatus, action: string, actorId: string, actorRole: Role) {
  return db.$transaction(async (tx: Tx) => {
    const sl = await tx.shortlist.findUniqueOrThrow({ where: { id: shortlistId } })
    if (!SHORTLIST_TRANSITIONS[sl.status].includes(to)) throw new Error(`Invalid transition: ${sl.status} → ${to}`)
    const updated = await tx.shortlist.update({ where: { id: shortlistId }, data: { status: to } })
    await logEvent(tx, { entityType: 'Shortlist', entityId: shortlistId, action, actorId, actorRole })
    return updated
  })
}

export async function createShortlist(projectId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const sl = await tx.shortlist.create({ data: { projectId } })
    await logEvent(tx, { entityType: 'Shortlist', entityId: sl.id, action: 'create', actorId, actorRole: 'admin' })
    return sl
  })
}

export async function addCandidate(shortlistId: string, consultantId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const candidate = await tx.shortlistCandidate.create({ data: { shortlistId, consultantId, addedBy: actorId } })
    await logEvent(tx, { entityType: 'ShortlistCandidate', entityId: candidate.id, action: 'add_candidate', actorId, actorRole: 'admin' })
    return candidate
  })
}

export async function submitForAdminReview(shortlistId: string, actorId: string) {
  return transition(shortlistId, 'ADMIN_REVIEW', 'submit_for_admin_review', actorId, 'admin')
}

export async function makeClientVisible(shortlistId: string, actorId: string) {
  const sl = await db.shortlist.findUniqueOrThrow({ where: { id: shortlistId } })
  if (!SHORTLIST_TRANSITIONS[sl.status].includes('CLIENT_VISIBLE')) {
    throw new Error(`Invalid transition: ${sl.status} → CLIENT_VISIBLE`)
  }

  await db.$transaction(async (tx: Tx) => {
    await tx.shortlist.update({ where: { id: shortlistId }, data: { status: 'CLIENT_VISIBLE' } })
    await logEvent(tx, { entityType: 'Shortlist', entityId: shortlistId, action: 'make_client_visible', actorId, actorRole: 'admin' })
  })

  await markShortlistReady(sl.projectId, actorId)

  return db.shortlist.findUniqueOrThrow({ where: { id: shortlistId } })
}

export async function closeShortlist(shortlistId: string, actorId: string) {
  return transition(shortlistId, 'CLOSED', 'close', actorId, 'admin')
}

export async function getShortlist(id: string) {
  return db.shortlist.findUnique({ where: { id }, include: { candidates: { include: { consultant: true } } } })
}
