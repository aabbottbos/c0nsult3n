-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ProposalStatus" ADD VALUE 'PENDING_ADMIN_REVIEW';
ALTER TYPE "ProposalStatus" ADD VALUE 'NOT_SELECTED';
ALTER TYPE "ProposalStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "deviationReviewedAt" TIMESTAMP(3),
ADD COLUMN     "deviationReviewedBy" TEXT,
ADD COLUMN     "deviationsApproved" BOOLEAN;
