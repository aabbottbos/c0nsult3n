-- AlterTable
ALTER TABLE "ShortlistCandidate" ADD COLUMN     "adminApprovalStatus" TEXT,
ADD COLUMN     "aiFitRationale" TEXT,
ADD COLUMN     "aiFitScore" INTEGER,
ADD COLUMN     "aiFitTier" TEXT,
ADD COLUMN     "aiRiskFlags" TEXT,
ADD COLUMN     "baselineScore" INTEGER,
ADD COLUMN     "clientVisibleStatus" TEXT,
ADD COLUMN     "filterReason" TEXT;
