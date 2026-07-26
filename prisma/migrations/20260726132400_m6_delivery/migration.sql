/*
  Warnings:

  - Added the required column `reason` to the `AdminTask` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `messageType` on the `EngagementCommunication` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "CommunicationType" AS ENUM ('CLARIFICATION', 'DOCUMENT_REQUEST', 'REVISION_RESPONSE', 'ISSUE_FLAG');

-- AlterTable
ALTER TABLE "AdminTask" ADD COLUMN     "deliverableId" TEXT,
ADD COLUMN     "engagementId" TEXT,
ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "resolved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Deliverable" ADD COLUMN     "aiQaNotes" TEXT,
ADD COLUMN     "aiQaRiskFlag" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiQaRunAt" TIMESTAMP(3),
ADD COLUMN     "consultantNotes" TEXT,
ADD COLUMN     "revisionRequestId" TEXT;

-- AlterTable
ALTER TABLE "EngagementCommunication" DROP COLUMN "messageType",
ADD COLUMN     "messageType" "CommunicationType" NOT NULL;

-- AlterTable
ALTER TABLE "RevisionRequest" ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "inScopeConfirmation" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "satisfaction" INTEGER NOT NULL,
    "repeatIntent" BOOLEAN NOT NULL,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Feedback_engagementId_submittedBy_key" ON "Feedback"("engagementId", "submittedBy");

-- AddForeignKey
ALTER TABLE "Deliverable" ADD CONSTRAINT "Deliverable_revisionRequestId_fkey" FOREIGN KEY ("revisionRequestId") REFERENCES "RevisionRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
