import { db } from '@/lib/db'
import type { Tx } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import { isEligible } from '@/modules/restrictions/service'
import { callClaude } from '@/lib/ai'
import type { ConsultantProfile } from '@/app/generated/prisma'
import type { AiAssessment, MatchingResult } from './types'

export async function runMatching(projectId: string, actorId: string): Promise<MatchingResult> {
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    include: { scope: true },
  })

  if (!project.scope) throw new Error('Cannot run matching: project has no scope')

  // Eligibility filter: approved, active, published
  const candidates = await db.consultantProfile.findMany({
    where: { approvalStatus: 'approved', accountStatus: 'active', publicationStatus: 'published' },
  })

  const eligible: ConsultantProfile[] = []
  for (const c of candidates) {
    const { eligible: ok } = await isEligible(c.id)
    if (ok) eligible.push(c)
  }

  // Ensure shortlist exists
  let shortlist = await db.shortlist.findUnique({ where: { projectId } })
  if (!shortlist) {
    shortlist = await db.$transaction(async (tx: Tx) => {
      const sl = await tx.shortlist.create({ data: { projectId } })
      await logEvent(tx, { entityType: 'Shortlist', entityId: sl.id, action: 'create', actorId, actorRole: 'admin' })
      return sl
    })
  }

  // AI fit assessment
  const scope = project.scope
  const system = `You are a consultant-matching assistant. Given a project scope and a list of consultant IDs, return a fit assessment for each. Respond ONLY with valid JSON: { "assessments": [{ "consultantId": "string", "tier": "HIGH" | "MEDIUM" | "LOW", "rationale": "string (1-2 sentences, internal admin use only)" }] }`

  const candidateList = eligible.map(c => `ConsultantId: ${c.id} | Status: ${c.approvalStatus}/${c.accountStatus}/${c.publicationStatus}`).join('\n')
  const prompt = `Scope:\nDeliverable: ${scope.deliverable}\nAcceptance criteria: ${scope.acceptanceCriteria}\nFee: $${scope.fee} / ${scope.effortCapHours}h cap\n\nEligible consultants:\n${candidateList || 'None'}\n\nReturn assessments JSON now.`

  let aiAssessments: AiAssessment[] = []
  if (eligible.length > 0) {
    const raw = await callClaude(system, prompt)
    try {
      const parsed = JSON.parse(raw) as { assessments: AiAssessment[] }
      aiAssessments = parsed.assessments
    } catch {
      aiAssessments = []
    }

    await db.aIOutputLog.create({
      data: {
        touchpoint: 'matching_assessment',
        promptVersion: 'v1',
        model: 'claude-sonnet-4-6',
        inputSummary: `Project: ${project.title}, eligible: ${eligible.length}`,
        output: JSON.stringify(aiAssessments),
        exposed: false,
        reviewed: false,
      },
    })
  }

  await db.$transaction(async (tx: Tx) => {
    await logEvent(tx, { entityType: 'Project', entityId: projectId, action: 'run_matching', actorId, actorRole: 'admin' })
  })

  return { shortlistId: shortlist.id, eligible, aiAssessments }
}
