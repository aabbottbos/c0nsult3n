-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('OPENED', 'UNDER_ADMIN_REVIEW', 'PROPOSED_RESOLUTION', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('NOT_REQUIRED_YET', 'AUTHORIZATION_PENDING', 'AUTHORIZED', 'PAYMENT_FAILED', 'PAYMENT_CONFIRMED', 'RELEASE_PENDING', 'RELEASED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'RELEASE_PENDING', 'RELEASED', 'ON_HOLD', 'REFUNDED');

-- AlterTable: rename clientId -> clientContactId on Engagement
ALTER TABLE "Engagement" RENAME COLUMN "clientId" TO "clientContactId";

-- AddForeignKey: Engagement.clientContactId -> ClientContact.id
ALTER TABLE "Engagement" ADD CONSTRAINT "Engagement_clientContactId_fkey" FOREIGN KEY ("clientContactId") REFERENCES "ClientContact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: expand Dispute model
ALTER TABLE "Dispute"
  ADD COLUMN "engagementId"       TEXT,
  ADD COLUMN "openedBy"           TEXT,
  ADD COLUMN "disputeReason"      TEXT,
  ADD COLUMN "issueSummary"       TEXT,
  ADD COLUMN "aiDisputeSummary"   TEXT,
  ADD COLUMN "adminReviewStatus"  "DisputeStatus" NOT NULL DEFAULT 'OPENED',
  ADD COLUMN "proposedResolution" TEXT,
  ADD COLUMN "finalResolution"    TEXT,
  ADD COLUMN "resultingStatus"    "EngagementStatus",
  ADD COLUMN "closedAt"           TIMESTAMP(3),
  ADD COLUMN "updatedAt"          TIMESTAMP(3);

-- Backfill updatedAt for any existing rows (there shouldn't be any, but be safe)
UPDATE "Dispute" SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL;

-- Now make required columns NOT NULL
ALTER TABLE "Dispute"
  ALTER COLUMN "engagementId"  SET NOT NULL,
  ALTER COLUMN "openedBy"      SET NOT NULL,
  ALTER COLUMN "disputeReason" SET NOT NULL,
  ALTER COLUMN "updatedAt"     SET NOT NULL;

-- CreateIndex: unique on Dispute.engagementId
CREATE UNIQUE INDEX "Dispute_engagementId_key" ON "Dispute"("engagementId");

-- AddForeignKey: Dispute.engagementId -> Engagement.id
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PaymentTransactionRecord
CREATE TABLE "PaymentTransactionRecord" (
    "id"             TEXT NOT NULL,
    "engagementId"   TEXT NOT NULL,
    "amount"         DECIMAL(10,2) NOT NULL,
    "platformFee"    DECIMAL(10,2),
    "payoutAmount"   DECIMAL(10,2),
    "paymentStatus"  "PaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED_YET',
    "payoutStatus"   "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDueDate" TIMESTAMP(3),
    "adminNotes"     TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentTransactionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique on PaymentTransactionRecord.engagementId
CREATE UNIQUE INDEX "PaymentTransactionRecord_engagementId_key" ON "PaymentTransactionRecord"("engagementId");

-- AddForeignKey: PaymentTransactionRecord.engagementId -> Engagement.id
ALTER TABLE "PaymentTransactionRecord" ADD CONSTRAINT "PaymentTransactionRecord_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
