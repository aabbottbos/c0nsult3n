-- CreateTable
CREATE TABLE "ConsultantVerification" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "identityStatus" TEXT NOT NULL DEFAULT 'NOT_SUBMITTED',
    "credentialNotes" TEXT,
    "adminNotes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantVerification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsultantPayoutSetup" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "accountType" TEXT,
    "maskedAccount" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_SET',
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantPayoutSetup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantVerification_consultantId_key" ON "ConsultantVerification"("consultantId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultantPayoutSetup_consultantId_key" ON "ConsultantPayoutSetup"("consultantId");

-- AddForeignKey
ALTER TABLE "ConsultantVerification" ADD CONSTRAINT "ConsultantVerification_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "ConsultantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsultantPayoutSetup" ADD CONSTRAINT "ConsultantPayoutSetup_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "ConsultantProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
