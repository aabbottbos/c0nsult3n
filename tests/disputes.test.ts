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
import { startEngagement, acceptEngagement } from '@/modules/engagements/service'
import { submitDeliverable } from '@/modules/deliverables/service'
import { openDispute, resolveDispute, generateAiDisputeSummary } from '@/modules/disputes/service'

async function buildUnderReviewEngagement() {
  const admin = await upsertUser({ clerkId: 'disp_admin', email: 'admin@disp.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'disp_client', email: 'client@disp.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'disp_consultant', email: 'consultant@disp.test', role: 'consultant' })

  const org = await createOrganization({ name: 'Disp Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'Disp Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Report',
    acceptanceCriteria: 'Complete',
    assumptions: 'Data provided',
    exclusions: 'None',
    dueDate: new Date('2026-12-31'),
    fee: 1500,
    effortCapHours: 6,
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
  await startEngagement(engagement.id, admin.id)

  // Submit deliverable and move to UNDER_REVIEW
  const deliverable = await submitDeliverable(engagement.id, null, 'Work done.', admin.id)
  await prisma.deliverable.update({
    where: { id: deliverable.id },
    data: { aiQaRiskFlag: false, aiQaRunAt: new Date(), aiQaNotes: 'Looks good.' },
  })
  await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })

  const freshEng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
  return { admin, clientUser, profile, freshEng }
}

describe('M7 disputes', () => {
  it('openDispute transitions engagement to DISPUTED and creates Dispute record', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()

    const dispute = await openDispute(freshEng.id, admin.id, 'Deliverable does not meet criteria.')

    expect(dispute.adminReviewStatus).toBe('OPENED')
    expect(dispute.disputeReason).toBe('Deliverable does not meet criteria.')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('DISPUTED')

    const event = await prisma.eventLog.findFirst({ where: { entityType: 'Dispute', action: 'open' } })
    expect(event).not.toBeNull()
  })

  it('resolveDispute with ACCEPTED outcome transitions engagement to ACCEPTED and closes dispute', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Client unhappy.')

    const resolved = await resolveDispute(dispute.id, 'Reviewed and accepted as-is.', 'ACCEPTED', admin.id)

    expect(resolved.adminReviewStatus).toBe('CLOSED')
    expect(resolved.finalResolution).toBe('Reviewed and accepted as-is.')
    expect(resolved.resultingStatus).toBe('ACCEPTED')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('ACCEPTED')
  })

  it('resolveDispute with CANCELLED outcome transitions engagement to CANCELLED', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Fundamental scope disagreement.')

    await resolveDispute(dispute.id, 'Cannot reconcile. Cancelling.', 'CANCELLED', admin.id)

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: freshEng.id } })
    expect(eng.status).toBe('CANCELLED')
  })

  it('acceptEngagement is blocked while dispute is open', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    await openDispute(freshEng.id, admin.id, 'Issue flagged.')

    await expect(acceptEngagement(freshEng.id, admin.id)).rejects.toThrow('open dispute')
  })

  it('generateAiDisputeSummary writes to AIOutputLog with exposed: false', async () => {
    const { admin, freshEng } = await buildUnderReviewEngagement()
    const dispute = await openDispute(freshEng.id, admin.id, 'Quality issue.')

    await generateAiDisputeSummary(dispute.id, admin.id)

    const updatedDispute = await prisma.dispute.findUniqueOrThrow({ where: { id: dispute.id } })
    expect(updatedDispute.aiDisputeSummary).toBeTruthy()

    const log = await prisma.aIOutputLog.findFirst({ where: { touchpoint: 'dispute_summary' } })
    expect(log).not.toBeNull()
    expect(log!.exposed).toBe(false)
  })
})
