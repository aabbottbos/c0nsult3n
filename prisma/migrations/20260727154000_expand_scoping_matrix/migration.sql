-- CreateTable
CREATE TABLE "ScopingMatrixRow" (
    "id" TEXT NOT NULL,
    "specialization" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "responsibilityCategory" TEXT NOT NULL,
    "useCase" TEXT NOT NULL,
    "requiredInputs" TEXT NOT NULL,
    "deliverablePattern" TEXT NOT NULL,
    "acceptanceCriteriaPattern" TEXT NOT NULL,
    "standardExclusions" TEXT NOT NULL,
    "effortEstimateHours" INTEGER NOT NULL,
    "suitability" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScopingMatrixRow_pkey" PRIMARY KEY ("id")
);

-- DropTable (old stub)
DROP TABLE IF EXISTS "ScopingMatrixClassification";

-- CreateTable
CREATE TABLE "ScopingMatrixClassification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "matrixRowId" TEXT NOT NULL,
    "aiRationale" TEXT,
    "adminConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScopingMatrixClassification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScopingMatrixClassification_projectId_key" ON "ScopingMatrixClassification"("projectId");

-- AddForeignKey
ALTER TABLE "ScopingMatrixClassification" ADD CONSTRAINT "ScopingMatrixClassification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScopingMatrixClassification" ADD CONSTRAINT "ScopingMatrixClassification_matrixRowId_fkey" FOREIGN KEY ("matrixRowId") REFERENCES "ScopingMatrixRow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
