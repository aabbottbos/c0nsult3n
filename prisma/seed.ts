import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  // Admin user
  const adminUser = await db.user.upsert({
    where: { email: 'admin@consulten.test' },
    update: {},
    create: { clerkId: 'clerk_admin_seed', email: 'admin@consulten.test', role: 'admin' },
  })

  // Client org + contact user
  const clientUser = await db.user.upsert({
    where: { email: 'client@clearpath.test' },
    update: {},
    create: { clerkId: 'clerk_client_seed', email: 'client@clearpath.test', role: 'client' },
  })
  const org = await db.clientOrganization.upsert({
    where: { id: 'seed-org-1' },
    update: {},
    create: { id: 'seed-org-1', name: 'ClearPath Analytics' },
  })
  const existingContact = await db.clientContact.findUnique({ where: { userId: clientUser.id } })
  if (!existingContact) {
    await db.clientContact.create({
      data: { userId: clientUser.id, organizationId: org.id, name: 'Jordan Lee', email: clientUser.email },
    })
  }

  // Consultant user + profile
  const consultantUser = await db.user.upsert({
    where: { email: 'consultant@consulten.test' },
    update: {},
    create: { clerkId: 'clerk_consultant_seed', email: 'consultant@consulten.test', role: 'consultant' },
  })
  const profile = await (async () => {
    const existing = await db.consultantProfile.findUnique({ where: { userId: consultantUser.id } })
    if (existing) return existing
    return db.consultantProfile.create({
      data: { userId: consultantUser.id, approvalStatus: 'approved', accountStatus: 'active', publicationStatus: 'published' },
    })
  })()

  // Project
  const project = await db.project.upsert({
    where: { id: 'seed-project-1' },
    update: {},
    create: {
      id: 'seed-project-1',
      clientId: org.id,
      title: 'Market Segmentation',
      description: 'Segment our customer base into 3-5 ICP profiles.',
      status: 'SCOPE_APPROVED',
    },
  })

  // Scope
  const existingScope = await db.scope.findUnique({ where: { projectId: project.id } })
  const scope = existingScope ?? await db.scope.create({
    data: {
      projectId: project.id,
      status: 'CLIENT_CONFIRMED',
      deliverable: 'Segmentation report with 3–5 prioritized customer segments',
      acceptanceCriteria: 'Segments validated against CRM data',
      assumptions: 'Client provides CRM export within 48h',
      exclusions: 'Implementation, persona design',
      dueDate: new Date('2026-01-31'),
      fee: 2400,
      effortCapHours: 8,
    },
  })

  // Shortlist + candidate
  const existingShortlist = await db.shortlist.findUnique({ where: { projectId: project.id } })
  const shortlist = existingShortlist ?? await db.shortlist.create({
    data: { projectId: project.id, status: 'CLIENT_VISIBLE' },
  })

  const existingCandidate = await db.shortlistCandidate.findFirst({
    where: { shortlistId: shortlist.id, consultantId: profile.id },
  })
  const candidate = existingCandidate ?? await db.shortlistCandidate.create({
    data: { shortlistId: shortlist.id, consultantId: profile.id, addedBy: adminUser.id },
  })

  // Invitation
  const existingInvitation = await db.consultantInvitation.findFirst({
    where: { projectId: project.id, consultantId: profile.id },
  })
  const invitation = existingInvitation ?? await db.consultantInvitation.create({
    data: {
      shortlistCandidateId: candidate.id,
      projectId: project.id,
      consultantId: profile.id,
      status: 'ACCEPTED_INTEREST',
      sentAt: new Date(),
    },
  })

  // Proposal
  const existingProposal = await db.proposal.findFirst({ where: { invitationId: invitation.id } })
  if (!existingProposal) {
    await db.proposal.create({
      data: {
        invitationId: invitation.id,
        consultantId: profile.id,
        status: 'SUBMITTED',
        fitStatement: 'I have run 12 similar segmentation projects for SaaS companies.',
        deviations: {},
      },
    })
  }

  console.log('✅ Seed complete')
  console.log(`  Admin:      ${adminUser.email}`)
  console.log(`  Client:     ${clientUser.email} (${org.name})`)
  console.log(`  Consultant: ${consultantUser.email}`)
  console.log(`  Project:    ${project.title} [${project.status}]`)
  console.log(`  Scope:      ${scope.id} [${scope.status}]`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
