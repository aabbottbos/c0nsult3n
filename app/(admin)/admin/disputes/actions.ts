'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { openDispute, generateAiDisputeSummary, resolveDispute } from '@/modules/disputes/service'
import { updatePaymentStatus } from '@/modules/payments/service'
import type { PaymentStatus, PayoutStatus } from '@/app/generated/prisma'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function openDisputeAction(engagementId: string, formData: FormData) {
  const actor = await actorId()
  const disputeReason = formData.get('disputeReason') as string
  const dispute = await openDispute(engagementId, actor, disputeReason)
  redirect(`/admin/disputes/${dispute.id}`)
}

export async function generateAiDisputeSummaryAction(disputeId: string, engagementId: string) {
  await generateAiDisputeSummary(disputeId, await actorId())
  redirect(`/admin/disputes/${disputeId}`)
}

export async function resolveDisputeAction(disputeId: string, formData: FormData) {
  const actor = await actorId()
  const proposedResolution = formData.get('proposedResolution') as string
  const outcome = formData.get('outcome') as 'ACCEPTED' | 'REVISION_REQUESTED' | 'CANCELLED'
  await resolveDispute(disputeId, proposedResolution, outcome, actor)
  redirect(`/admin/disputes/${disputeId}`)
}

export async function updatePaymentStatusAction(engagementId: string, formData: FormData) {
  const actor = await actorId()
  const paymentStatus = formData.get('paymentStatus') as PaymentStatus
  const payoutStatus = formData.get('payoutStatus') as PayoutStatus
  const adminNotes = (formData.get('adminNotes') as string) || null
  await updatePaymentStatus(engagementId, paymentStatus, payoutStatus, adminNotes, actor)
  redirect(`/admin/engagements/${engagementId}`)
}
