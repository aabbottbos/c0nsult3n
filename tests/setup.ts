import { PrismaClient } from '../app/generated/prisma'
import { afterEach } from 'vitest'

const prisma = new PrismaClient()

afterEach(async () => {
  // Delete in reverse FK dependency order
  await prisma.deliverable.deleteMany()
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
