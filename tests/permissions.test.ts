// tests/permissions.test.ts
import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, submitProject, startAdminReview } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { createShortlist, addCandidate, submitForAdminReview, makeClientVisible } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation, acceptInterest } from '@/modules/invitations/service'
import { createProposal, selectProposal } from '@/modules/proposals/service'

describe('Permission invariants — raw status bypass rejected', () => {
  it('scope service rejects invalid transition (e.g. ADMIN_REVIEW → CLIENT_CONFIRMED skipping ADMIN_APPROVED)', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_1', email: 'admin@perm.test', role: 'admin' })
    const org = await createOrganization({ name: 'Perm Org' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Perm Project', description: 'test' }, admin.id)
    await submitProject(project.id, admin.id)
    await startAdminReview(project.id, admin.id)
    const scope = await createScope({
      projectId: project.id,
      deliverable: 'Report',
      acceptanceCriteria: 'Done',
      assumptions: '',
      exclusions: '',
      dueDate: new Date('2027-01-01'),
      fee: 1000,
      effortCapHours: 5,
    }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    // Scope is now ADMIN_REVIEW. Trying to jump to CLIENT_CONFIRMED must throw.
    await expect(confirmScope(scope.id, admin.id)).rejects.toThrow('Invalid transition')
  })

  it('engagement service rejects invalid transition (e.g. PENDING_START → ACCEPTED skipping IN_PROGRESS)', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_2', email: 'admin2@perm.test', role: 'admin' })
    const clientUser = await upsertUser({ clerkId: 'perm_client_2', email: 'client@perm.test', role: 'client' })
    const consultantUser = await upsertUser({ clerkId: 'perm_cons_2', email: 'cons@perm.test', role: 'consultant' })
    const org = await createOrganization({ name: 'Perm Org 2' }, admin.id)
    await prisma.clientContact.create({ data: { userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email } })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    let project = await createProject({ clientId: org.id, title: 'Perm Project 2', description: 'test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    // Confirm scope so selectProposal can find a CLIENT_CONFIRMED scope
    await confirmScope(scope.id, clientUser.id)
    const { markReadyForMatching, markMatchingInProgress } = await import('@/modules/projects/service')
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)
    const shortlist = await createShortlist(project.id, admin.id)
    const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)
    const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: candidate.id }, admin.id)
    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, consultantUser.id)
    const proposal = await createProposal({ invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fits' }, consultantUser.id)
    await selectProposal(proposal.id, clientUser.id)
    const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
    // Engagement is PENDING_START. Trying to jump to ACCEPTED must throw.
    const { acceptEngagement } = await import('@/modules/engagements/service')
    await expect(acceptEngagement(engagement.id, admin.id)).rejects.toThrow('Invalid transition')
  })

  it('proposal service rejects selecting a PENDING_ADMIN_REVIEW proposal', async () => {
    const admin = await upsertUser({ clerkId: 'perm_admin_3', email: 'admin3@perm.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'perm_cons_3', email: 'cons3@perm.test', role: 'consultant' })
    const org = await createOrganization({ name: 'Perm Org 3' }, admin.id)
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    let project = await createProject({ clientId: org.id, title: 'Perm Project 3', description: 'test' }, admin.id)
    project = await submitProject(project.id, admin.id)
    project = await startAdminReview(project.id, admin.id)
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)
    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)
    const { markReadyForMatching, markMatchingInProgress } = await import('@/modules/projects/service')
    project = await markReadyForMatching(project.id, admin.id)
    project = await markMatchingInProgress(project.id, admin.id)
    const shortlist = await createShortlist(project.id, admin.id)
    const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)
    const invitation = await createInvitation({ projectId: project.id, consultantId: profile.id, shortlistCandidateId: candidate.id }, admin.id)
    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, consultantUser.id)
    const { createProposal, selectProposal } = await import('@/modules/proposals/service')
    const proposal = await createProposal(
      { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fits', deviations: { fee: 'Need more' } },
      consultantUser.id
    )
    // Proposal is PENDING_ADMIN_REVIEW. Selecting it must throw.
    await expect(selectProposal(proposal.id, admin.id)).rejects.toThrow()
  })
})
