'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { startEngagement, submitDeliverable, beginReview, acceptEngagement, closeEngagement, cancelEngagement } from '@/modules/engagements/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function startEngagementAction(id: string) {
  await startEngagement(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}

export async function submitDeliverableAction(id: string) {
  await submitDeliverable(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}

export async function beginReviewAction(id: string) {
  await beginReview(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}

export async function acceptEngagementAction(id: string) {
  await acceptEngagement(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}

export async function closeEngagementAction(id: string) {
  await closeEngagement(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}

export async function cancelEngagementAction(id: string) {
  await cancelEngagement(id, await actorId())
  redirect(`/admin/engagements/${id}`)
}
