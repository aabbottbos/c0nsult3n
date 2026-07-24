import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview, markReadyForMatching, markMatchingInProgress } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation } from '@/modules/invitations/service'
import { createProposal, selectProposal, reviewDeviations, withdrawProposal } from '@/modules/proposals/service'

async function buildInvitation() {
  const admin = await upsertUser({ clerkId: 'm5_admin_t2', email: 'admin@m5t2.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'm5_client_t2', email: 'client@m5t2.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'm5_cons_t2', email: 'cons@m5t2.test', role: 'consultant' })
  const org = await createOrganization({ name: 'M5 T2 Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: 'client@m5t2.test' }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)
  let project = await createProject({ clientId: org.id, title: 'M5 T2 Project', description: 'test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)
  const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
  await moveToAdminReview(scope.id, admin.id)
  await approveScope(scope.id, admin.id)
  await confirmScope(scope.id, admin.id)
  project = await markReadyForMatching(project.id, admin.id)
  project = await markMatchingInProgress(project.id, admin.id)
  const shortlist = await createShortlist(project.id, admin.id)
  await addCandidate(shortlist.id, profile.id, admin.id)
  await submitForAdminReview(shortlist.id, admin.id)
  await makeClientVisible(shortlist.id, admin.id)
  const shortlistCandidate = await prisma.shortlistCandidate.findFirstOrThrow({ where: { shortlistId: shortlist.id } })
  const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: shortlistCandidate.id }, admin.id)
  await sendInvitation(invitation.id, admin.id)
  return { admin, org, profile, consultantUser, project, scope, invitation }
}

describe('M5 proposal and selection', () => {
  it('proposal with deviations is gated in PENDING_ADMIN_REVIEW; cannot be selected by client', async () => {
    const { admin, profile, consultantUser, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit', deviations: { fee: 'Need $200 more' } },
      consultantUser.id
    )
    expect(proposal.status).toBe('PENDING_ADMIN_REVIEW')
    await expect(selectProposal(proposal.id, admin.id)).rejects.toThrow()
  })

  it('after admin approves deviations, proposal moves to SUBMITTED and can be selected', async () => {
    const { admin, org, profile, consultantUser, project, scope, invitation } = await buildInvitation()
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'I fit', deviations: { fee: 'Need $200 more' } },
      consultantUser.id
    )
    expect(proposal.status).toBe('PENDING_ADMIN_REVIEW')
    await reviewDeviations(proposal.id, true, admin.id)
    const refreshed = await prisma.proposal.findUniqueOrThrow({ where: { id: proposal.id } })
    expect(refreshed.status).toBe('SUBMITTED')
    expect(refreshed.deviationsApproved).toBe(true)
    const contact = await prisma.clientContact.findFirstOrThrow({ where: { organizationId: org.id } })
    await selectProposal(proposal.id, contact.userId)
    const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
    expect(engagement.projectId).toBe(project.id)
    expect(engagement.scopeId).toBe(scope.id)
  })
})
