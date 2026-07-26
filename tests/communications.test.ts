import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile } from '@/modules/consultants/service'
import { createProject } from '@/modules/projects/service'
import { createScope } from '@/modules/scopes/service'
import { sendMessage, listMessages } from '@/modules/communications/service'

async function buildEngagementShell() {
  const admin = await upsertUser({ clerkId: 'comm_admin', email: 'admin@comm.test', role: 'admin' })
  const clientUser = await upsertUser({ clerkId: 'comm_client', email: 'client@comm.test', role: 'client' })
  const consultantUser = await upsertUser({ clerkId: 'comm_cons', email: 'cons@comm.test', role: 'consultant' })
  const org = await createOrganization({ name: 'Comm Corp' }, admin.id)
  await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client', email: clientUser.email }, admin.id)
  const profile = await createProfile({ userId: consultantUser.id }, admin.id)
  const project = await createProject({ clientId: org.id, title: 'Comm Project', description: 'Test' }, admin.id)
  const scope = await createScope({ projectId: project.id, deliverable: 'X', acceptanceCriteria: 'Y', assumptions: 'Z', exclusions: 'N', dueDate: new Date('2026-12-31'), fee: 500, effortCapHours: 2 }, admin.id)
  const shortlist = await prisma.shortlist.create({ data: { projectId: project.id } })
  const candidate = await prisma.shortlistCandidate.create({ data: { shortlistId: shortlist.id, consultantId: profile.id, addedBy: admin.id } })
  const invitation = await prisma.consultantInvitation.create({ data: { shortlistCandidateId: candidate.id, projectId: project.id, consultantId: profile.id } })
  const proposal = await prisma.proposal.create({ data: { invitationId: invitation.id, consultantId: profile.id, fitStatement: 'Fit.' } })
  const clientContactRec = await prisma.clientContact.findFirstOrThrow({ where: { organizationId: org.id } })
  const engagement = await prisma.engagement.create({ data: { projectId: project.id, scopeId: scope.id, proposalId: proposal.id, consultantId: profile.id, clientContactId: clientContactRec.id } })
  return { admin, clientUser, consultantUser, org, profile, engagement }
}

describe('M6 structured communications', () => {
  it('sendMessage with valid CommunicationType creates message', async () => {
    const { admin, engagement } = await buildEngagementShell()
    const msg = await sendMessage(engagement.id, admin.id, 'admin', 'CLARIFICATION', 'Please clarify the scope.')
    expect(msg.messageType).toBe('CLARIFICATION')
    expect(msg.body).toBe('Please clarify the scope.')
    const messages = await listMessages(engagement.id)
    expect(messages).toHaveLength(1)
  })

  it('client cannot read messages from a different engagement', async () => {
    const { admin, org, profile, engagement } = await buildEngagementShell()

    const project2 = await prisma.project.create({ data: { clientId: org.id, title: 'Other', description: 'X' } })
    const scope2 = await prisma.scope.create({ data: { projectId: project2.id, deliverable: 'X', acceptanceCriteria: 'Y', assumptions: 'Z', exclusions: 'N', dueDate: new Date('2026-12-31'), fee: 500, effortCapHours: 2 } })
    const shortlist2 = await prisma.shortlist.create({ data: { projectId: project2.id } })
    const candidate2 = await prisma.shortlistCandidate.create({ data: { shortlistId: shortlist2.id, consultantId: profile.id, addedBy: admin.id } })
    const invitation2 = await prisma.consultantInvitation.create({ data: { shortlistCandidateId: candidate2.id, projectId: project2.id, consultantId: profile.id } })
    const proposal2 = await prisma.proposal.create({ data: { invitationId: invitation2.id, consultantId: profile.id, fitStatement: 'Fit.' } })
    const clientContactRec2 = await prisma.clientContact.findFirstOrThrow({ where: { organizationId: org.id } })
    const engagement2 = await prisma.engagement.create({ data: { projectId: project2.id, scopeId: scope2.id, proposalId: proposal2.id, consultantId: profile.id, clientContactId: clientContactRec2.id } })

    await sendMessage(engagement2.id, admin.id, 'admin', 'ISSUE_FLAG', 'Issue on engagement 2.')

    const messagesForEngagement1 = await prisma.engagementCommunication.findMany({ where: { engagementId: engagement.id } })
    expect(messagesForEngagement1).toHaveLength(0)

    const messagesForEngagement2 = await prisma.engagementCommunication.findMany({ where: { engagementId: engagement2.id } })
    expect(messagesForEngagement2).toHaveLength(1)
  })
})
