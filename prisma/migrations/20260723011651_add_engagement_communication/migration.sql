-- CreateTable
CREATE TABLE "EngagementCommunication" (
    "id" TEXT NOT NULL,
    "engagementId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderRole" "Role" NOT NULL,
    "messageType" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementCommunication_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "EngagementCommunication" ADD CONSTRAINT "EngagementCommunication_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "Engagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
