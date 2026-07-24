import type { ConsultantProfile } from '@/app/generated/prisma'

export interface AiAssessment {
  consultantId: string
  tier: 'HIGH' | 'MEDIUM' | 'LOW'
  rationale: string
}

export interface MatchingResult {
  shortlistId: string
  eligible: ConsultantProfile[]
  aiAssessments: AiAssessment[]
}
