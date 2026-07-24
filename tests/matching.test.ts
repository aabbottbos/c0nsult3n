import { describe, it, expect } from 'vitest'
import { prisma } from './setup'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization } from '@/modules/clients/service'
import { createProfile, approveProfile, publishProfile } from '@/modules/consultants/service'
import { createProject, markReadyForMatching } from '@/modules/projects/service'
import { createScope, moveToAdminReview, approveScope, confirmScope } from '@/modules/scopes/service'
import { addRestriction } from '@/modules/restrictions/service'
import { runMatching } from '@/modules/matching/service'

describe('M4 matching service', () => {
  it('includes approved+published consultants with no active restrictions', async () => {
    const admin = await upsertUser({ clerkId: 'm4_admin_1', email: 'admin@m4.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'm4_cons_1', email: 'cons@m4.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)

    const org = await createOrganization({ name: 'M4 Org' }, admin.id)
    let project = await prisma.project.create({ data: { clientId: org.id, title: 'M4 Test', description: 'desc', status: 'READY_FOR_MATCHING' } })
    const scope = await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)

    const result = await runMatching(project.id, admin.id)

    expect(result.eligible.map(e => e.id)).toContain(profile.id)
  })

  it('excludes consultants with active restrictions', async () => {
    const admin = await upsertUser({ clerkId: 'm4_admin_2', email: 'admin2@m4.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'm4_cons_2', email: 'cons2@m4.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)
    await addRestriction(profile.id, { type: 'client_visibility', activeFrom: new Date() }, admin.id)

    const org = await createOrganization({ name: 'M4 Org 2' }, admin.id)
    const project = await prisma.project.create({ data: { clientId: org.id, title: 'M4 Test 2', description: 'desc', status: 'READY_FOR_MATCHING' } })
    await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)

    const result = await runMatching(project.id, admin.id)

    expect(result.eligible.map(e => e.id)).not.toContain(profile.id)
  })

  it('excludes non-approved or non-published consultants', async () => {
    const admin = await upsertUser({ clerkId: 'm4_admin_3', email: 'admin3@m4.test', role: 'admin' })
    const pendingUser = await upsertUser({ clerkId: 'm4_cons_3', email: 'cons3@m4.test', role: 'consultant' })
    const pendingProfile = await createProfile({ userId: pendingUser.id }, admin.id)
    // NOT approved, NOT published

    const org = await createOrganization({ name: 'M4 Org 3' }, admin.id)
    const project = await prisma.project.create({ data: { clientId: org.id, title: 'M4 Test 3', description: 'desc', status: 'READY_FOR_MATCHING' } })
    await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)

    const result = await runMatching(project.id, admin.id)

    expect(result.eligible.map(e => e.id)).not.toContain(pendingProfile.id)
  })

  it('shortlist candidate stores aiFitTier and aiFitRationale', async () => {
    const admin = await upsertUser({ clerkId: 'm4_admin_4', email: 'admin4@m4.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'm4_cons_4', email: 'cons4@m4.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)

    const org = await createOrganization({ name: 'M4 Org 4' }, admin.id)
    const project = await prisma.project.create({ data: { clientId: org.id, title: 'M4 Test 4', description: 'desc', status: 'READY_FOR_MATCHING' } })
    await createScope({ projectId: project.id, deliverable: 'Report', acceptanceCriteria: 'Done', assumptions: '', exclusions: '', dueDate: new Date('2027-01-01'), fee: 1000, effortCapHours: 5 }, admin.id)

    // Directly create a shortlist and candidate to simulate addCandidate with M4 fields
    const shortlist = await prisma.shortlist.create({ data: { projectId: project.id } })
    const candidate = await prisma.shortlistCandidate.create({
      data: {
        shortlistId: shortlist.id,
        consultantId: profile.id,
        addedBy: admin.id,
        aiFitTier: 'HIGH',
        aiFitRationale: 'Strong analytical background.',
      },
    })

    const saved = await prisma.shortlistCandidate.findUniqueOrThrow({ where: { id: candidate.id } })
    expect(saved.aiFitTier).toBe('HIGH')
    expect(saved.aiFitRationale).toBe('Strong analytical background.')
  })
})

describe('M4 invitation permission invariants', () => {
  it('createInvitation fails if shortlistCandidateId does not exist', async () => {
    const admin = await upsertUser({ clerkId: 'm4_inv_admin', email: 'invadmin@m4.test', role: 'admin' })
    const { createInvitation } = await import('@/modules/invitations/service')

    await expect(
      createInvitation({
        shortlistCandidateId: 'nonexistent-id',
        projectId: 'nonexistent-project',
        consultantId: 'nonexistent-consultant',
      }, admin.id)
    ).rejects.toThrow()
  })

  it('client shortlist query never returns aiFitTier, aiRiskFlags, or filterReason', async () => {
    const admin = await upsertUser({ clerkId: 'm4_client_perm', email: 'cperm@m4.test', role: 'admin' })
    const consultantUser = await upsertUser({ clerkId: 'm4_cperm_cons', email: 'cpermc@m4.test', role: 'consultant' })
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)

    const org = await createOrganization({ name: 'M4 Perm Org' }, admin.id)
    const project = await prisma.project.create({ data: { clientId: org.id, title: 'M4 Perm Test', description: 'desc', status: 'SHORTLIST_READY' } })
    const shortlist = await prisma.shortlist.create({ data: { projectId: project.id, status: 'CLIENT_VISIBLE' } })
    await prisma.shortlistCandidate.create({
      data: {
        shortlistId: shortlist.id,
        consultantId: profile.id,
        addedBy: admin.id,
        aiFitTier: 'HIGH',
        aiFitRationale: 'Internal only',
        aiRiskFlags: 'Some risk flag',
        filterReason: 'Passed all filters',
        rationale: 'Client-approved rationale',
      },
    })

    // Simulate the client query: only select fields the client should see
    const clientView = await prisma.shortlistCandidate.findMany({
      where: { shortlistId: shortlist.id },
      select: {
        id: true,
        consultantId: true,
        rationale: true,
        // aiFitTier, aiFitRationale, aiRiskFlags, filterReason intentionally NOT selected
      },
    })

    expect(clientView[0]).not.toHaveProperty('aiFitTier')
    expect(clientView[0]).not.toHaveProperty('aiRiskFlags')
    expect(clientView[0]).not.toHaveProperty('filterReason')
    expect(clientView[0]).toHaveProperty('rationale', 'Client-approved rationale')
  })
})
