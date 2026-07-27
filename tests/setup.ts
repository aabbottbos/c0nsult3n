import 'dotenv/config'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local', override: true })
import { PrismaClient } from '../app/generated/prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { beforeEach, afterEach } from 'vitest'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

const TRUNCATE_SQL = `
  TRUNCATE
    "AdminTask", "AIOutputLog", "Feedback", "RevisionRequest", "Deliverable",
    "EngagementCommunication", "Dispute", "PaymentTransactionRecord", "Engagement",
    "Proposal", "ConsultantInvitation", "ShortlistCandidate", "Shortlist", "Scope",
    "ScopingMatrixClassification", "ScopingMatrixRow", "Project",
    "ConsultantRestriction", "ConsultantVerification", "ConsultantPayoutSetup",
    "ConsultantProfile", "ClientContact", "ClientOrganization", "Notification",
    "EventLog", "LegalAcceptanceRecord", "User"
  CASCADE
`

beforeEach(async () => {
  await prisma.$executeRawUnsafe(TRUNCATE_SQL)
})

afterEach(async () => {
  await prisma.$executeRawUnsafe(TRUNCATE_SQL)
})

export { prisma }
