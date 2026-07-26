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
import { startEngagement, acceptEngagement, closeEngagement } from '@/modules/engagements/service'
import { createFeedback } from '@/modules/deliverables/service'

async function buildAcceptedEngagement() {
  const admin = await upsertUser({ clerkId: 'co_admin', email: 'admin@co.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'co_client', email: 'client@co.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'co_consultant', email: 'consultant@co.test', role: 'consultant' })

  const org = await createOrganization({ name: 'CO Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'CO Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Report',
    acceptanceCriteria: 'Validated',
    assumptions: 'Data provided',
    exclusions: 'None',
    dueDate: new Date('2026-12-31'),
    fee: 1000,
    effortCapHours: 5,
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

  const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fit.' }, admin.id)
  await selectProposal(proposal.id, admin.id)

  const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
  await startEngagement(engagement.id, admin.id)
  await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })
  await acceptEngagement(engagement.id, admin.id)

  return { admin, clientUser, consultantUser, engagement }
}

describe('M6 closeout and feedback', () => {
  it('ACCEPTED → CLOSED then both roles can submit feedback', async () => {
    const { admin, clientUser, consultantUser, engagement } = await buildAcceptedEngagement()

    await closeEngagement(engagement.id, admin.id)

    const closed = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
    expect(closed.status).toBe('CLOSED')

    await createFeedback(engagement.id, clientUser.id, 'client', 5, true, 'Great work!')
    await createFeedback(engagement.id, consultantUser.id, 'consultant', 4, true, 'Good client.')

    const feedbacks = await prisma.feedback.findMany({ where: { engagementId: engagement.id } })
    expect(feedbacks).toHaveLength(2)
    expect(feedbacks.map(f => f.role).sort()).toEqual(['client', 'consultant'])
  })

  it('duplicate feedback submission upserts instead of creating a second row', async () => {
    const { admin, clientUser, engagement } = await buildAcceptedEngagement()
    await closeEngagement(engagement.id, admin.id)

    await createFeedback(engagement.id, clientUser.id, 'client', 3, false, 'Okay.')
    await createFeedback(engagement.id, clientUser.id, 'client', 5, true, 'Updated: great!')

    const feedbacks = await prisma.feedback.findMany({ where: { engagementId: engagement.id, submittedBy: clientUser.id } })
    expect(feedbacks).toHaveLength(1)
    expect(feedbacks[0].satisfaction).toBe(5)
    expect(feedbacks[0].comments).toBe('Updated: great!')
  })

  it('closeEngagement throws when engagement is not ACCEPTED', async () => {
    const admin = await upsertUser({ clerkId: 'co_err_admin', email: 'admin@coerr.test', role: 'admin' })
    const clientUser = await upsertUser({ clerkId: 'co_err_client', email: 'client@coerr.test', role: 'client' })
    const consultantUser = await upsertUser({ clerkId: 'co_err_cons', email: 'cons@coerr.test', role: 'consultant' })
    const org = await createOrganization({ name: 'Err Corp' }, admin.id)
    await createContact({ userId: clientUser.id, organizationId: org.id, name: 'C', email: clientUser.email }, admin.id)
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Err Project', description: 'Test' }, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'X', acceptanceCriteria: 'Y', assumptions: 'Z', exclusions: 'N', dueDate: new Date('2026-12-31'), fee: 500, effortCapHours: 2 }, admin.id)
    const shortlist = await prisma.shortlist.create({ data: { projectId: project.id } })
    const candidate = await prisma.shortlistCandidate.create({ data: { shortlistId: shortlist.id, consultantId: profile.id, addedBy: admin.id } })
    const invitation = await prisma.consultantInvitation.create({ data: { shortlistCandidateId: candidate.id, projectId: project.id, consultantId: profile.id } })
    const proposal = await prisma.proposal.create({ data: { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'X' } })
    const engagement = await prisma.engagement.create({ data: { projectId: project.id, scopeId: scope.id, proposalId: proposal.id, consultantId: profile.id, clientId: org.id, status: 'IN_PROGRESS' } })
    await expect(closeEngagement(engagement.id, admin.id)).rejects.toThrow()
  })
})
