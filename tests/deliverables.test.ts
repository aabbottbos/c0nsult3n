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
import { submitDeliverable, resubmitDeliverable, runAiQa, createFeedback } from '@/modules/deliverables/service'

async function buildEngagement() {
  const admin = await upsertUser({ clerkId: 'del_admin', email: 'admin@del.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'del_client', email: 'client@del.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'del_consultant', email: 'consultant@del.test', role: 'consultant' })

  const org = await createOrganization({ name: 'Del Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  await approveProfile(profile.id, admin.id)
  await publishProfile(profile.id, admin.id)

  let project = await createProject({ clientId: org.id, title: 'Del Project', description: 'Test' }, admin.id)
  project = await submitProject(project.id, admin.id)
  project = await startAdminReview(project.id, admin.id)

  const scope = await createScope({
    projectId: project.id,
    deliverable: 'Analysis report',
    acceptanceCriteria: 'Fully validated',
    assumptions: 'Data provided',
    exclusions: 'Implementation',
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

  return { admin, clientUser, consultantUser, profile, scope, project, engagement }
}

describe('M6 deliverables: submit, AI QA, accept', () => {
  it('submitDeliverable creates deliverable and transitions engagement to DELIVERABLE_SUBMITTED', async () => {
    const { admin, engagement } = await buildEngagement()
    const deliverable = await submitDeliverable(engagement.id, null, 'My notes here', admin.id)

    expect(deliverable.consultantNotes).toBe('My notes here')
    expect(deliverable.status).toBe('SUBMITTED')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
    expect(eng.status).toBe('DELIVERABLE_SUBMITTED')
  })

  it('runAiQa populates QA fields and transitions engagement to UNDER_REVIEW', async () => {
    const { admin, engagement } = await buildEngagement()
    const deliverable = await submitDeliverable(engagement.id, null, 'Completed the analysis as requested.', admin.id)

    await runAiQa(deliverable.id, admin.id)

    const updated = await prisma.deliverable.findUniqueOrThrow({ where: { id: deliverable.id } })
    expect(updated.aiQaNotes).toBeTruthy()
    expect(updated.aiQaRunAt).not.toBeNull()

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
    expect(eng.status).toBe('UNDER_REVIEW')

    const log = await prisma.aIOutputLog.findFirst({ where: { touchpoint: 'deliverable_qa' } })
    expect(log).not.toBeNull()
  })

  it('AI QA risk flag creates AdminTask and blocks acceptEngagement', async () => {
    const { admin, engagement } = await buildEngagement()
    const deliverable = await submitDeliverable(engagement.id, null, 'Incomplete deliverable.', admin.id)

    await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: { aiQaRiskFlag: true, aiQaRunAt: new Date(), aiQaNotes: 'Risk detected.' },
    })
    await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })

    const task = await prisma.adminTask.create({
      data: { engagementId: engagement.id, deliverableId: deliverable.id, reason: 'AI QA risk flag' },
    })

    await expect(acceptEngagement(engagement.id, admin.id)).rejects.toThrow('Acceptance blocked')

    await prisma.adminTask.update({ where: { id: task.id }, data: { resolved: true } })
    const eng = await acceptEngagement(engagement.id, admin.id)
    expect(eng.status).toBe('ACCEPTED')
  })

  it('no risk flag allows acceptEngagement without admin intervention', async () => {
    const { admin, engagement } = await buildEngagement()
    const deliverable = await submitDeliverable(engagement.id, null, 'Clean deliverable.', admin.id)

    await prisma.deliverable.update({
      where: { id: deliverable.id },
      data: { aiQaRiskFlag: false, aiQaRunAt: new Date(), aiQaNotes: 'Looks good.' },
    })
    await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })

    const eng = await acceptEngagement(engagement.id, admin.id)
    expect(eng.status).toBe('ACCEPTED')
  })

  it('resubmitDeliverable links to RevisionRequest and marks it ADDRESSED', async () => {
    const { admin, engagement } = await buildEngagement()
    const deliverable = await submitDeliverable(engagement.id, null, 'First attempt.', admin.id)

    await prisma.deliverable.update({ where: { id: deliverable.id }, data: { aiQaRunAt: new Date() } })
    await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'UNDER_REVIEW' } })

    const revisionRequest = await prisma.revisionRequest.create({
      data: { engagementId: engagement.id, deliverableId: deliverable.id, requestedBy: admin.id, reason: 'Needs more detail' },
    })
    await prisma.engagement.update({ where: { id: engagement.id }, data: { status: 'REVISION_REQUESTED' } })

    const newDeliverable = await resubmitDeliverable(engagement.id, revisionRequest.id, null, 'Revised notes.', admin.id)

    expect(newDeliverable.revisionRequestId).toBe(revisionRequest.id)
    expect(newDeliverable.consultantNotes).toBe('Revised notes.')

    const updatedRequest = await prisma.revisionRequest.findUniqueOrThrow({ where: { id: revisionRequest.id } })
    expect(updatedRequest.status).toBe('ADDRESSED')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
    expect(eng.status).toBe('DELIVERABLE_SUBMITTED')
  })
})
