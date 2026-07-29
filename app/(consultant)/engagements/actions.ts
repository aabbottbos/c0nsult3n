'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { submitDeliverable, resubmitDeliverable, runAiQa, createFeedback } from '@/modules/deliverables/service'
import { sendMessage } from '@/modules/communications/service'
import { sendDeliverableSubmittedAdminEmail } from '@/lib/email'
import { createNotification } from '@/modules/notifications/service'
import type { CommunicationType } from '@/app/generated/prisma'

async function consultantIds() {
  await requireRole('consultant')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUnique({ where: { clerkId: userId } })
  if (!user) throw new Error('Account setup in progress — please try again in a moment.')
  const profile = await db.consultantProfile.findUnique({ where: { userId: user.id } })
  if (!profile) throw new Error('Account setup in progress — please try again in a moment.')
  return { userId: user.id, profileId: profile.id }
}

export async function submitDeliverableAction(engagementId: string, formData: FormData) {
  const { userId } = await consultantIds()
  const file = formData.get('file') as File | null
  const consultantNotes = (formData.get('consultantNotes') as string | null) ?? ''

  let fileUrl: string | null = null
  if (file && file.size > 0) {
    const blob = await put(`${engagementId}/${file.name}`, file, { access: 'public' })
    fileUrl = blob.url
  }

  const deliverable = await submitDeliverable(engagementId, fileUrl, consultantNotes, userId)

  // Fire AI QA and admin notification after state transition
  runAiQa(deliverable.id, userId).catch(console.error)

  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { project: true, clientContact: true },
  })
  const adminUsers = await db.user.findMany({ where: { role: 'admin' } })
  for (const adminUser of adminUsers) {
    await sendDeliverableSubmittedAdminEmail({
      adminEmail: adminUser.email,
      projectTitle: eng.project.title,
      engagementId,
    })
  }
  if (eng.clientContact?.userId) {
    await createNotification({
      recipientId: eng.clientContact.userId,
      type: 'DELIVERABLE_SUBMITTED',
      body: `A deliverable has been submitted for ${eng.project.title}.`,
      link: `/projects/${eng.project.id}/engagement/${engagementId}`,
    })
  }

  redirect(`/engagements/${engagementId}`)
}

export async function resubmitDeliverableAction(engagementId: string, revisionRequestId: string, formData: FormData) {
  const { userId } = await consultantIds()
  const file = formData.get('file') as File | null
  const consultantNotes = (formData.get('consultantNotes') as string | null) ?? ''

  let fileUrl: string | null = null
  if (file && file.size > 0) {
    const blob = await put(`${engagementId}/${file.name}`, file, { access: 'public' })
    fileUrl = blob.url
  }

  const deliverable = await resubmitDeliverable(engagementId, revisionRequestId, fileUrl, consultantNotes, userId)
  runAiQa(deliverable.id, userId).catch(console.error)

  redirect(`/engagements/${engagementId}`)
}

export async function sendMessageAction(engagementId: string, formData: FormData) {
  const { userId } = await consultantIds()
  const messageType = formData.get('messageType') as CommunicationType
  const body = formData.get('body') as string
  await sendMessage(engagementId, userId, 'consultant', messageType, body)
  redirect(`/engagements/${engagementId}`)
}

export async function createFeedbackAction(engagementId: string, formData: FormData) {
  const { userId } = await consultantIds()
  const satisfaction = parseInt(formData.get('satisfaction') as string, 10)
  const repeatIntent = formData.get('repeatIntent') === 'true'
  const comments = (formData.get('comments') as string | null) || null
  await createFeedback(engagementId, userId, 'consultant', satisfaction, repeatIntent, comments)
  redirect(`/engagements/${engagementId}`)
}
