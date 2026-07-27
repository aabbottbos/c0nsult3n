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
  return db.consultantProfile.findUnique({ where: { id }, include: { restrictions: true, verification: true, payoutSetup: true } })
}

export async function createVerification(consultantId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const v = await tx.consultantVerification.create({ data: { consultantId } })
    await logEvent(tx, { entityType: 'ConsultantVerification', entityId: v.id, action: 'create', actorId, actorRole: 'admin' })
    return v
  })
}

export async function updateVerification(
  verificationId: string,
  data: { identityStatus?: string; credentialNotes?: string; adminNotes?: string; verifiedAt?: Date | null },
  actorId: string
) {
  return db.$transaction(async (tx: Tx) => {
    const v = await tx.consultantVerification.update({ where: { id: verificationId }, data })
    await logEvent(tx, { entityType: 'ConsultantVerification', entityId: verificationId, action: 'update', actorId, actorRole: 'admin' })
    return v
  })
}

export async function createPayoutSetup(consultantId: string, actorId: string) {
  return db.$transaction(async (tx: Tx) => {
    const p = await tx.consultantPayoutSetup.create({ data: { consultantId } })
    await logEvent(tx, { entityType: 'ConsultantPayoutSetup', entityId: p.id, action: 'create', actorId, actorRole: 'admin' })
    return p
  })
}

export async function updatePayoutSetup(
  payoutSetupId: string,
  data: { accountType?: string; maskedAccount?: string; status?: string; adminNotes?: string },
  actorId: string
) {
  return db.$transaction(async (tx: Tx) => {
    const p = await tx.consultantPayoutSetup.update({ where: { id: payoutSetupId }, data })
    await logEvent(tx, { entityType: 'ConsultantPayoutSetup', entityId: payoutSetupId, action: 'update', actorId, actorRole: 'admin' })
    return p
  })
}
