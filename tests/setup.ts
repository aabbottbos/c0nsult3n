import 'dotenv/config'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', override: true })
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { afterEach } from 'vitest'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

afterEach(async () => {
  // Delete in reverse FK dependency order
  await prisma.revisionRequest.deleteMany()
  await prisma.deliverable.deleteMany()
  await prisma.engagementCommunication.deleteMany()
  await prisma.engagement.deleteMany()
  await prisma.proposal.deleteMany()
  await prisma.consultantInvitation.deleteMany()
  await prisma.shortlistCandidate.deleteMany()
  await prisma.shortlist.deleteMany()
  await prisma.scope.deleteMany()
  await prisma.project.deleteMany()
  await prisma.consultantRestriction.deleteMany()
  await prisma.consultantProfile.deleteMany()
  await prisma.clientContact.deleteMany()
  await prisma.clientOrganization.deleteMany()
  await prisma.eventLog.deleteMany()
  await prisma.legalAcceptanceRecord.deleteMany()
  await prisma.user.deleteMany()
})

export { prisma }
