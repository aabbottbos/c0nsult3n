'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { startEngagement, beginReview, acceptEngagement, closeEngagement, cancelEngagement, resolveAdminTask } from '@/modules/engagements/service'
import { updateRevisionRequest } from '@/modules/deliverables/service'
import { sendMessage } from '@/modules/communications/service'
import type { CommunicationType } from '@/app/generated/prisma'

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

export async function resolveAdminTaskAction(adminTaskId: string, engagementId: string) {
  await resolveAdminTask(adminTaskId, await actorId())
  redirect(`/admin/engagements/${engagementId}`)
}

export async function updateRevisionRequestAction(revisionRequestId: string, engagementId: string, formData: FormData) {
  const actor = await actorId()
  const inScopeConfirmation = formData.get('inScopeConfirmation') === 'true'
  const dueDateRaw = formData.get('dueDate') as string | null
  const dueDate = dueDateRaw ? new Date(dueDateRaw) : null
  await updateRevisionRequest(revisionRequestId, { inScopeConfirmation, dueDate }, actor)
  redirect(`/admin/engagements/${engagementId}`)
}

export async function sendMessageAction(engagementId: string, formData: FormData) {
  const actor = await actorId()
  const messageType = formData.get('messageType') as CommunicationType
  const body = formData.get('body') as string
  await sendMessage(engagementId, actor, 'admin', messageType, body)
  redirect(`/admin/engagements/${engagementId}`)
}
