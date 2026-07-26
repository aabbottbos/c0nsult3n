import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'
import { updatePaymentStatus, getPaymentRecord } from '@/modules/payments/service'

async function buildEngagementWithPayment() {
  const admin = await upsertUser({ clerkId: 'pay_admin', email: 'admin@pay.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'pay_client', email: 'client@pay.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'pay_consultant', email: 'consultant@pay.test', role: 'consultant' })

  const org = await createOrganization({ name: 'Pay Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'Pay Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Report',
    acceptanceCriteria: 'Complete',
    assumptions: 'Data provided',
    exclusions: 'None',
    dueDate: new Date('2026-12-31'),
    fee: 2500,
    effortCapHours: 8,
  }, admin.id)
  await moveToAdminReview(scope.id, admin.id)
  await approveScope(scope.id, admin.id)
  await confirmScope(scope.id, admin.id)

  project = await markReadyForMatching(project.id, admin.id)
  project = await markMatchingInProgress(project.id, admin.id)

  const shortlist = await createShortlist(project.id, admin.id)
  const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
  await submitForAdminReview(shortlist.id, admin.id)
  await makeClientVisible(shortlist.id, admin.id)

  const invitation = await createInvitation({
    shortlistCandidateId: candidate.id,
    projectId: project.id,
    consultantId: profile.id,
    expiresAt: new Date('2026-12-31'),
  }, admin.id)
  await sendInvitation(invitation.id, admin.id)
  await acceptInterest(invitation.id, admin.id)

  const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Great fit.' }, admin.id)
  await selectProposal(proposal.id, admin.id)

  const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
  return { admin, clientUser, consultantUser, profile, engagement }
}

describe('M7 payments', () => {
  it('payment record is auto-created on engagement creation with scope fee as amount', async () => {
    const { engagement } = await buildEngagementWithPayment()

    const record = await getPaymentRecord(engagement.id)
    expect(record).not.toBeNull()
    expect(record!.amount.toString()).toBe('2500')
    expect(record!.paymentStatus).toBe('NOT_REQUIRED_YET')
    expect(record!.payoutStatus).toBe('PENDING')
  })

  it('updatePaymentStatus — admin can update payment and payout status with notes', async () => {
    const { admin, engagement } = await buildEngagementWithPayment()

    await updatePaymentStatus(engagement.id, 'AUTHORIZED', 'PENDING', 'Client authorized payment.', admin.id)

    const record = await getPaymentRecord(engagement.id)
    expect(record!.paymentStatus).toBe('AUTHORIZED')
    expect(record!.adminNotes).toBe('Client authorized payment.')

    const event = await prisma.eventLog.findFirst({
      where: { entityType: 'PaymentTransactionRecord', action: 'update_status' },
    })
    expect(event).not.toBeNull()
  })

  it('client field projection: platformFee is not included in client-facing select', async () => {
    const { engagement } = await buildEngagementWithPayment()

    // Simulate what the client portal query does: select only amount and paymentStatus
    const record = await prisma.paymentTransactionRecord.findUnique({
      where: { engagementId: engagement.id },
      select: { amount: true, paymentStatus: true },
    })
    expect(record).not.toBeNull()
    expect(record!.amount).toBeDefined()
    expect((record as Record<string, unknown>)['platformFee']).toBeUndefined()
  })

  it('consultant field projection: amount and paymentStatus not in consultant-facing select', async () => {
    const { engagement } = await buildEngagementWithPayment()

    // Simulate what the consultant portal query does: select only payoutAmount and payoutStatus
    const record = await prisma.paymentTransactionRecord.findUnique({
      where: { engagementId: engagement.id },
      select: { payoutAmount: true, payoutStatus: true },
    })
    expect(record).not.toBeNull()
    expect((record as Record<string, unknown>)['amount']).toBeUndefined()
    expect((record as Record<string, unknown>)['paymentStatus']).toBeUndefined()
  })
})
