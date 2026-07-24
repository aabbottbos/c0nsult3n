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
import { startEngagement, submitDeliverable, beginReview, acceptEngagement, closeEngagement } from '@/modules/engagements/service'
import { createDeliverable } from '@/modules/deliverables/service'


describe('M1 spine: full path intake → closeout', () => {
  it('walks the complete happy path and records every state transition', async () => {
    // ── Step 1: Users ──────────────────────────────────────────────────────
    const admin = await upsertUser({ clerkId: 'spine_admin', email: 'admin@spine.test', role: 'admin' })
    const clientUser = await upsertUser({ clerkId: 'spine_client', email: 'client@spine.test', role: 'client' })
    const consultantUser = await upsertUser({ clerkId: 'spine_consultant', email: 'consultant@spine.test', role: 'consultant' })

    // ── Step 2: Client org + consultant profile ────────────────────────────
    const org = await createOrganization({ name: 'Spine Corp' }, admin.id)
    await createContact({ userId: clientUser.id, organizationId: org.id, name: 'Client User', email: clientUser.email }, admin.id)
    const profile = await createProfile({ userId: consultantUser.id }, admin.id)
    await approveProfile(profile.id, admin.id)
    await publishProfile(profile.id, admin.id)

    const freshProfile = await prisma.consultantProfile.findUniqueOrThrow({ where: { id: profile.id } })
    expect(freshProfile.approvalStatus).toBe('approved')
    expect(freshProfile.publicationStatus).toBe('published')

    // ── Step 3: Project intake ─────────────────────────────────────────────
    let project = await createProject({ clientId: org.id, title: 'Spine Test', description: 'Full path test' }, admin.id)
    expect(project.status).toBe('DRAFT')

    project = await submitProject(project.id, admin.id)
    expect(project.status).toBe('SUBMITTED')

    project = await startAdminReview(project.id, admin.id)
    expect(project.status).toBe('UNDER_ADMIN_REVIEW')

    // ── Step 4: Scope ──────────────────────────────────────────────────────
    const scope = await createScope({
      projectId: project.id,
      deliverable: 'Analysis report',
      acceptanceCriteria: 'Validated',
      assumptions: 'Data provided',
      exclusions: 'Implementation',
      dueDate: new Date('2026-12-31'),
      fee: 1500,
      effortCapHours: 6,
    }, admin.id)
    expect(scope.status).toBe('AI_DRAFTED')

    await moveToAdminReview(scope.id, admin.id)
    await approveScope(scope.id, admin.id)

    project = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(project.status).toBe('SCOPE_APPROVED')

    await confirmScope(scope.id, admin.id)
    const confirmedScope = await prisma.scope.findUniqueOrThrow({ where: { id: scope.id } })
    expect(confirmedScope.status).toBe('CLIENT_CONFIRMED')

    // ── Step 5: Matching → Shortlist ───────────────────────────────────────
    project = await markReadyForMatching(project.id, admin.id)
    expect(project.status).toBe('READY_FOR_MATCHING')

    project = await markMatchingInProgress(project.id, admin.id)
    expect(project.status).toBe('MATCHING_IN_PROGRESS')

    const shortlist = await createShortlist(project.id, admin.id)
    expect(shortlist.status).toBe('DRAFT')

    const candidate = await addCandidate(shortlist.id, profile.id, admin.id)
    expect(candidate.consultantId).toBe(profile.id)

    await submitForAdminReview(shortlist.id, admin.id)
    await makeClientVisible(shortlist.id, admin.id)

    project = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(project.status).toBe('SHORTLIST_READY')

    // ── Step 6: Invitation ─────────────────────────────────────────────────
    const invitation = await createInvitation({
      shortlistCandidateId: candidate.id,
      projectId: project.id,
      consultantId: profile.id,
      expiresAt: new Date('2026-12-31'),
    }, admin.id)
    expect(invitation.status).toBe('DRAFT')

    await sendInvitation(invitation.id, admin.id)
    await acceptInterest(invitation.id, admin.id)

    const sentInv = await prisma.consultantInvitation.findUniqueOrThrow({ where: { id: invitation.id } })
    expect(sentInv.status).toBe('ACCEPTED_INTEREST')

    // ── Step 7: Proposal → Engagement ─────────────────────────────────────
    const proposal = await createProposal({
      invitationId: invitation.id,
      consultantId: profile.id,
      fitStatement: 'Excellent fit.',
    }, admin.id)
    expect(proposal.status).toBe('SUBMITTED')

    await selectProposal(proposal.id, admin.id)

    // selectProposal now creates the engagement automatically
    const engagement = await prisma.engagement.findFirstOrThrow({ where: { proposalId: proposal.id } })
    expect(engagement.status).toBe('PENDING_START')

    project = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(project.status).toBe('ENGAGEMENT_CREATED')

    // ── Step 8: Engagement → Closeout ─────────────────────────────────────
    await startEngagement(engagement.id, admin.id)
    await createDeliverable(engagement.id, consultantUser.id)
    await submitDeliverable(engagement.id, admin.id)
    await beginReview(engagement.id, admin.id)
    await acceptEngagement(engagement.id, admin.id)
    await closeEngagement(engagement.id, admin.id)

    const closedEngagement = await prisma.engagement.findUniqueOrThrow({ where: { id: engagement.id } })
    expect(closedEngagement.status).toBe('CLOSED')

    project = await prisma.project.findUniqueOrThrow({ where: { id: project.id } })
    expect(project.status).toBe('CLOSED')

    // ── Verify EventLog recorded transitions ───────────────────────────────
    const events = await prisma.eventLog.findMany({ where: { entityType: 'Project', entityId: project.id } })
    expect(events.length).toBeGreaterThan(0)
    const actions = events.map((e) => e.action)
    expect(actions).toContain('create')
    expect(actions).toContain('submit')
    expect(actions).toContain('close')
  })
})

describe('M2 portal permission invariants', () => {
  it('client can only see their own organization projects', async () => {
    const admin = await upsertUser({ clerkId: 'm2_admin', email: 'admin@m2.test', role: 'admin' })
    const clientUserA = await upsertUser({ clerkId: 'm2_client_a', email: 'a@m2.test', role: 'client' })
    const clientUserB = await upsertUser({ clerkId: 'm2_client_b', email: 'b@m2.test', role: 'client' })

    const orgA = await createOrganization({ name: 'Org A' }, admin.id)
    const orgB = await createOrganization({ name: 'Org B' }, admin.id)
    await createContact({ userId: clientUserA.id, organizationId: orgA.id, name: 'A', email: 'a@m2.test' }, admin.id)
    await createContact({ userId: clientUserB.id, organizationId: orgB.id, name: 'B', email: 'b@m2.test' }, admin.id)

    const projectA = await createProject({ clientId: orgA.id, title: 'Project A', description: 'A' }, admin.id)
    const projectB = await createProject({ clientId: orgB.id, title: 'Project B', description: 'B' }, admin.id)

    const contactA = await prisma.clientContact.findUniqueOrThrow({ where: { userId: clientUserA.id } })
    const projectsForA = await prisma.project.findMany({ where: { clientId: contactA.organizationId } })
    expect(projectsForA.map(p => p.id)).toContain(projectA.id)
    expect(projectsForA.map(p => p.id)).not.toContain(projectB.id)
  })

  it('consultant can only see their own invitations', async () => {
    const admin = await upsertUser({ clerkId: 'm2_inv_admin', email: 'admin@m2inv.test', role: 'admin' })
    const consultantUserA = await upsertUser({ clerkId: 'm2_cons_a', email: 'cons_a@m2.test', role: 'consultant' })
    const consultantUserB = await upsertUser({ clerkId: 'm2_cons_b', email: 'cons_b@m2.test', role: 'consultant' })

    const profileA = await createProfile({ userId: consultantUserA.id }, admin.id)
    const profileB = await createProfile({ userId: consultantUserB.id }, admin.id)

    const org = await createOrganization({ name: 'Test Org M2' }, admin.id)
    const project = await createProject({ clientId: org.id, title: 'Test Project M2', description: 'desc' }, admin.id)
    await submitProject(project.id, admin.id)

    const shortlist = await prisma.shortlist.create({ data: { projectId: project.id } })
    const candidateA = await prisma.shortlistCandidate.create({ data: { shortlistId: shortlist.id, consultantId: profileA.id, addedBy: admin.id } })

    const invitationA = await prisma.consultantInvitation.create({
      data: { shortlistCandidateId: candidateA.id, projectId: project.id, consultantId: profileA.id, status: 'SENT' },
    })

    const invForA = await prisma.consultantInvitation.findMany({
      where: { consultantId: profileA.id, status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] } },
    })
    expect(invForA.map(i => i.id)).toContain(invitationA.id)

    const invForB = await prisma.consultantInvitation.findMany({
      where: { consultantId: profileB.id, status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] } },
    })
    expect(invForB.map(i => i.id)).not.toContain(invitationA.id)
  })

  it('webhook: user.created with role client creates org + contact records', async () => {
    const clerkId = 'm2_wh_client'
    const email = 'webhook_client@m2.test'
    const role = 'client' as const

    const user = await upsertUser({ clerkId, email, role })
    const domain = email.split('@')[1]!
    const org = await createOrganization({ name: domain }, user.id)
    await createContact({ userId: user.id, organizationId: org.id, name: email.split('@')[0]!, email }, user.id)

    const contact = await prisma.clientContact.findUnique({ where: { userId: user.id } })
    expect(contact).not.toBeNull()
    expect(contact!.organizationId).toBe(org.id)
  })

  it('webhook: user.created with role consultant creates profile record', async () => {
    const clerkId = 'm2_wh_consultant'
    const email = 'webhook_consultant@m2.test'
    const role = 'consultant' as const

    const user = await upsertUser({ clerkId, email, role })
    const profile = await createProfile({ userId: user.id }, user.id)

    const found = await prisma.consultantProfile.findUnique({ where: { userId: user.id } })
    expect(found).not.toBeNull()
    expect(found!.approvalStatus).toBe('pending')
  })
})
