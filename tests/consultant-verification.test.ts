import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import {
  createProfile,
  createVerification,
  updateVerification,
  createPayoutSetup,
  updatePayoutSetup,
} from '@/modules/consultants/service'

describe('ConsultantVerification', () => {
  it('createVerification creates record with NOT_SUBMITTED status and logs event', async () => {
    const admin = await upsertUser({ clerkId: 'cv_admin', email: 'admin@cv.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'cv_cons', email: 'cons@cv.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)

    const verification = await createVerification(profile.id, admin.id)

    expect(verification.consultantId).toBe(profile.id)
    expect(verification.identityStatus).toBe('NOT_SUBMITTED')

    const event = await prisma.eventLog.findFirst({ where: { entityType: 'ConsultantVerification', action: 'create' } })
    expect(event).not.toBeNull()
  })

  it('updateVerification updates status and adminNotes', async () => {
    const admin = await upsertUser({ clerkId: 'cv_admin_2', email: 'admin2@cv.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'cv_cons_2', email: 'cons2@cv.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    const verification = await createVerification(profile.id, admin.id)

    const updated = await updateVerification(
      verification.id,
      { identityStatus: 'VERIFIED', adminNotes: 'ID verified via Stripe Identity', verifiedAt: new Date() },
      admin.id
    )

    expect(updated.identityStatus).toBe('VERIFIED')
    expect(updated.adminNotes).toBe('ID verified via Stripe Identity')
    expect(updated.verifiedAt).not.toBeNull()
  })

  it('ConsultantVerification is unique per consultant (cannot create twice)', async () => {
    const admin = await upsertUser({ clerkId: 'cv_admin_3', email: 'admin3@cv.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'cv_cons_3', email: 'cons3@cv.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await createVerification(profile.id, admin.id)

    await expect(createVerification(profile.id, admin.id)).rejects.toThrow()
  })
})

describe('ConsultantPayoutSetup', () => {
  it('createPayoutSetup creates record with NOT_SET status and logs event', async () => {
    const admin = await upsertUser({ clerkId: 'cp_admin', email: 'admin@cp.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'cp_cons', email: 'cons@cp.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)

    const payout = await createPayoutSetup(profile.id, admin.id)

    expect(payout.consultantId).toBe(profile.id)
    expect(payout.status).toBe('NOT_SET')

    const event = await prisma.eventLog.findFirst({ where: { entityType: 'ConsultantPayoutSetup', action: 'create' } })
    expect(event).not.toBeNull()
  })

  it('updatePayoutSetup updates accountType and maskedAccount', async () => {
    const admin = await upsertUser({ clerkId: 'cp_admin_2', email: 'admin2@cp.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'cp_cons_2', email: 'cons2@cp.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    const payout = await createPayoutSetup(profile.id, admin.id)

    const updated = await updatePayoutSetup(
      payout.id,
      { accountType: 'bank_transfer', maskedAccount: '****6789', status: 'ACTIVE' },
      admin.id
    )

    expect(updated.accountType).toBe('bank_transfer')
    expect(updated.maskedAccount).toBe('****6789')
    expect(updated.status).toBe('ACTIVE')
  })
})
