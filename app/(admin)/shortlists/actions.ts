'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { submitForAdminReview, makeClientVisible, closeShortlist } from '@/modules/shortlists/service'
import { createInvitation, sendInvitation } from '@/modules/invitations/service'
import { callClaude } from '@/lib/ai'
import { db } from '@/lib/db'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function submitForAdminReviewAction(id: string) {
  await submitForAdminReview(id, await actorId())
  redirect(`/shortlists/${id}`)
}

export async function makeClientVisibleAction(id: string) {
  await makeClientVisible(id, await actorId())
  redirect(`/shortlists/${id}`)
}

export async function closeShortlistAction(id: string) {
  await closeShortlist(id, await actorId())
  redirect(`/shortlists/${id}`)
}

export async function generateMatchRationaleAction(shortlistId: string) {
  await requireRole('admin')
  const actor = await actorId()

  const shortlist = await db.shortlist.findUniqueOrThrow({
    where: { id: shortlistId },
    include: {
      project: { include: { scope: true } },
      candidates: { include: { consultant: true } },
    },
  })

  if (!shortlist.project.scope) throw new Error('Cannot generate rationale: no approved scope')

  const scope = shortlist.project.scope
  const system = `You are matching consultants to a fixed-scope consulting engagement. For each consultant, write a 2-3 sentence client-facing rationale explaining why they are a strong fit. Be specific. Do not make things up about the consultant — only reference their profile data. Respond ONLY with valid JSON: { "rationales": [{ "candidateId": "string", "rationale": "string" }] }`

  const candidatesText = shortlist.candidates.map(c =>
    `CandidateId: ${c.id}\nConsultantProfileId: ${c.consultantId}\nApprovalStatus: ${c.consultant.approvalStatus}\nAccountStatus: ${c.consultant.accountStatus}`
  ).join('\n\n')

  const prompt = `Engagement scope:\nDeliverable: ${scope.deliverable}\nAcceptance criteria: ${scope.acceptanceCriteria}\nFee: $${scope.fee} / ${scope.effortCapHours}h cap\n\nCandidates:\n${candidatesText}\n\nGenerate rationale JSON now.`

  const raw = await callClaude(system, prompt)

  let parsed: { rationales: { candidateId: string; rationale: string }[] }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  await Promise.all(parsed.rationales.map(r =>
    db.shortlistCandidate.update({
      where: { id: r.candidateId },
      data: { rationale: r.rationale },
    })
  ))

  await db.aIOutputLog.create({
    data: {
      touchpoint: 'match_rationale',
      promptVersion: 'v1',
      model: 'claude-sonnet-4-6',
      inputSummary: `Shortlist: ${shortlistId}, Project: ${shortlist.project.title}`,
      output: raw,
      exposed: false,
      reviewed: false,
    },
  })

  redirect(`/shortlists/${shortlistId}`)
}

export async function createAndSendInvitationAction(
  shortlistCandidateId: string,
  projectId: string,
  consultantId: string,
  shortlistId: string,
) {
  const actor = await actorId()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 14) // 14-day response deadline
  const invitation = await createInvitation({ shortlistCandidateId, projectId, consultantId, expiresAt }, actor)
  await sendInvitation(invitation.id, actor)
  redirect(`/shortlists/${shortlistId}`)
}
