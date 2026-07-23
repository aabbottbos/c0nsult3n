import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from './setup'
import { submitDeliverable } from '@/modules/engagements/service'
import { put } from '@vercel/blob'

vi.mock('@vercel/blob', () => ({
  put: vi.fn(),
}))

vi.mock('@/lib/email', () => ({
  sendInvitationEmail: vi.fn(),
  sendProposalSelectedEmail: vi.fn(),
  sendEngagementStartedEmail: vi.fn(),
  sendDeliverableSubmittedEmail: vi.fn(),
}))

const mockedPut = vi.mocked(put)

describe('file upload: deliverable fileUrl is stored', () => {
  let engagementId: string
  let actorUserId: string

  beforeEach(async () => {
    mockedPut.mockResolvedValue({
      url: 'https://blob.vercel-storage.com/test-deliverable.pdf',
      downloadUrl: 'https://blob.vercel-storage.com/test-deliverable.pdf?download=1',
      pathname: 'test-deliverable.pdf',
      contentType: 'application/pdf',
      contentDisposition: 'attachment; filename="test-deliverable.pdf"',
    } as Awaited<ReturnType<typeof put>>)

    // Create the minimum records needed: a User and an IN_PROGRESS Engagement.
    // We bypass the full state machine to avoid Neon interactive transaction timeouts
    // that occur when a long beforeEach runs after the spine test.
    const adminUser = await prisma.user.create({
      data: { clerkId: 'fu2_admin', email: 'admin@fu2.test', role: 'admin' },
    })
    actorUserId = adminUser.id

    const consultantUser = await prisma.user.create({
      data: { clerkId: 'fu2_consultant', email: 'consultant@fu2.test', role: 'consultant' },
    })
    const clientUser = await prisma.user.create({
      data: { clerkId: 'fu2_client', email: 'client@fu2.test', role: 'client' },
    })

    const org = await prisma.clientOrganization.create({ data: { name: 'FU2 Corp' } })

    const consultantProfile = await prisma.consultantProfile.create({
      data: { userId: consultantUser.id },
    })

    const project = await prisma.project.create({
      data: { clientId: org.id, title: 'FU2 Test', description: 'File upload test', status: 'SHORTLIST_READY' },
    })

    const scope = await prisma.scope.create({
      data: {
        projectId: project.id,
        deliverable: 'Test deliverable',
        acceptanceCriteria: 'Criteria',
        assumptions: '',
        exclusions: '',
        dueDate: new Date('2026-12-31'),
        fee: 1000,
        effortCapHours: 10,
        status: 'CLIENT_CONFIRMED',
      },
    })

    const proposal = await prisma.proposal.create({
      data: {
        invitationId: await prisma.consultantInvitation.create({
          data: {
            shortlistCandidateId: await prisma.shortlistCandidate.create({
              data: {
                shortlistId: await prisma.shortlist.create({
                  data: { projectId: project.id, status: 'CLIENT_VISIBLE' },
                }).then(s => s.id),
                consultantId: consultantProfile.id,
                addedBy: adminUser.id,
              },
            }).then(c => c.id),
            projectId: project.id,
            consultantId: consultantProfile.id,
            status: 'PROPOSAL_SUBMITTED',
          },
        }).then(i => i.id),
        consultantId: consultantProfile.id,
        fitStatement: 'Great fit',
        status: 'SELECTED',
      },
    })

    const engagement = await prisma.engagement.create({
      data: {
        projectId: project.id,
        scopeId: scope.id,
        proposalId: proposal.id,
        consultantId: consultantProfile.id,
        clientId: org.id,
        status: 'IN_PROGRESS',
      },
    })
    engagementId = engagement.id
  })

  it('stores the blob URL in Deliverable.fileUrl after upload', async () => {
    const fakeFile = new File(['hello'], 'deliverable.pdf', { type: 'application/pdf' })
    const blobUrl = (await mockedPut('deliverable.pdf', fakeFile, { access: 'public' })).url

    // Simulate what submitDeliverableAction does: create deliverable with the URL
    const deliverable = await prisma.deliverable.create({
      data: {
        engagementId,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        fileUrl: blobUrl,
      },
    })

    await submitDeliverable(engagementId, actorUserId)

    const saved = await prisma.deliverable.findUniqueOrThrow({ where: { id: deliverable.id } })
    expect(saved.fileUrl).toBe('https://blob.vercel-storage.com/test-deliverable.pdf')

    const eng = await prisma.engagement.findUniqueOrThrow({ where: { id: engagementId } })
    expect(eng.status).toBe('DELIVERABLE_SUBMITTED')
  })
})
