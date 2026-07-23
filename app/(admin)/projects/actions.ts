'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import {
  submitProject,
  startAdminReview,
  markNeedsClarification,
  markReadyForMatching,
  markMatchingInProgress,
  cancelProject,
} from '@/modules/projects/service'
import { createScope, moveToAdminReview } from '@/modules/scopes/service'
import { callClaude } from '@/lib/ai'
import { db } from '@/lib/db'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function submitProjectAction(id: string) {
  await submitProject(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function startAdminReviewAction(id: string) {
  await startAdminReview(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function markNeedsClarificationAction(id: string) {
  await markNeedsClarification(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function markReadyForMatchingAction(id: string) {
  await markReadyForMatching(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function markMatchingInProgressAction(id: string) {
  await markMatchingInProgress(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function cancelProjectAction(id: string) {
  await cancelProject(id, await actorId())
  redirect(`/projects/${id}`)
}

export async function draftScopeWithAIAction(projectId: string) {
  await requireRole('admin')
  const actor = await actorId()

  const project = await db.project.findUniqueOrThrow({ where: { id: projectId } })

  const system = `You are an expert business analyst. Given a project description, produce a structured scope for a fixed-fee consulting engagement (max 10 hours). Respond ONLY with valid JSON matching this schema exactly:
{
  "deliverable": "string — what will be produced",
  "acceptanceCriteria": "string — how done is verified",
  "assumptions": "string — what must be true for the work to proceed",
  "exclusions": "string — what this engagement does NOT include",
  "feeEstimate": number,
  "effortCapHours": number,
  "dueDateDaysFromNow": number
}`

  const prompt = `Project title: ${project.title}\n\nProject description: ${project.description}\n\nProduce the scope JSON now.`

  const raw = await callClaude(system, prompt)

  let parsed: {
    deliverable: string
    acceptanceCriteria: string
    assumptions: string
    exclusions: string
    feeEstimate: number
    effortCapHours: number
    dueDateDaysFromNow: number
  }
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Claude returned invalid JSON: ${raw.slice(0, 200)}`)
  }

  const dueDate = new Date()
  dueDate.setDate(dueDate.getDate() + (parsed.dueDateDaysFromNow ?? 30))

  const scope = await createScope({
    projectId,
    deliverable: parsed.deliverable,
    acceptanceCriteria: parsed.acceptanceCriteria,
    assumptions: parsed.assumptions,
    exclusions: parsed.exclusions,
    dueDate,
    fee: parsed.feeEstimate,
    effortCapHours: parsed.effortCapHours,
  }, actor)

  await db.aIOutputLog.create({
    data: {
      touchpoint: 'scope_draft',
      promptVersion: 'v1',
      model: 'claude-sonnet-4-6',
      inputSummary: `Project: ${project.title}`,
      output: raw,
      exposed: false,
      reviewed: false,
    },
  })

  await moveToAdminReview(scope.id, actor)
  redirect(`/scopes/${scope.id}`)
}
