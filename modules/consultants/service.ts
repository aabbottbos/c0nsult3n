import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'

export async function createProfile(data: { userId: string }, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const profile = await tx.consultantProfile.create({ data: { userId: data.userId } })
    await logEvent(tx, { entityType: 'ConsultantProfile', entityId: profile.id, action: 'create', actorId, actorRole: 'admin' })
    return profile
  })
}

export async function approveProfile(profileId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const profile = await tx.consultantProfile.findUniqueOrThrow({ where: { id: profileId } })
    if (profile.approvalStatus !== 'pending') throw new Error(`Cannot approve profile with status ${profile.approvalStatus}`)
    const updated = await tx.consultantProfile.update({ where: { id: profileId }, data: { approvalStatus: 'approved' } })
    await logEvent(tx, { entityType: 'ConsultantProfile', entityId: profileId, action: 'approve', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function suspendProfile(profileId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const updated = await tx.consultantProfile.update({ where: { id: profileId }, data: { accountStatus: 'suspended' } })
    await logEvent(tx, { entityType: 'ConsultantProfile', entityId: profileId, action: 'suspend', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function publishProfile(profileId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const profile = await tx.consultantProfile.findUniqueOrThrow({ where: { id: profileId } })
    if (profile.approvalStatus !== 'approved') throw new Error('Cannot publish unapproved profile')
    if (profile.accountStatus !== 'active') throw new Error('Cannot publish non-active profile')
    const updated = await tx.consultantProfile.update({ where: { id: profileId }, data: { publicationStatus: 'published' } })
    await logEvent(tx, { entityType: 'ConsultantProfile', entityId: profileId, action: 'publish', actorId, actorRole: 'admin' })
    return updated
  })
}

export async function listProfiles() {
  return db.consultantProfile.findMany({ orderBy: { createdAt: 'desc' } })
}

export async function getProfile(id: string) {
  return db.consultantProfile.findUnique({ where: { id }, include: { restrictions: true } })
}
