export type ScopingMatrixRow = {
  id: string
  specialization: string
  function: string
  responsibilityCategory: string
  useCase: string
  requiredInputs: string
  deliverablePattern: string
  acceptanceCriteriaPattern: string
  standardExclusions: string
  effortEstimateHours: number
  suitability: string
  createdAt: Date
}

export type ScopingMatrixClassification = {
  id: string
  projectId: string
  matrixRowId: string
  aiRationale: string | null
  adminConfirmed: boolean
  createdAt: Date
  updatedAt: Date
}
