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
