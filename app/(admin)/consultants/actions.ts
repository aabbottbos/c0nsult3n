'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import {
  approveProfile, publishProfile, suspendProfile,
  createVerification, updateVerification,
  createPayoutSetup, updatePayoutSetup,
} from '@/modules/consultants/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function approveProfileAction(id: string) {
  await approveProfile(id, await actorId())
  redirect(`/consultants/${id}`)
}

export async function publishProfileAction(id: string) {
  await publishProfile(id, await actorId())
  redirect(`/consultants/${id}`)
}

export async function suspendProfileAction(id: string) {
  await suspendProfile(id, await actorId())
  redirect(`/consultants/${id}`)
}

export async function createVerificationAction(consultantId: string) {
  await createVerification(consultantId, await actorId())
  redirect(`/consultants/${consultantId}`)
}

export async function updateVerificationAction(verificationId: string, consultantId: string, formData: FormData) {
  const identityStatus = formData.get('identityStatus') as string
  const credentialNotes = formData.get('credentialNotes') as string | null
  const adminNotes = formData.get('adminNotes') as string | null
  const verifiedAt = identityStatus === 'VERIFIED' ? new Date() : null
  await updateVerification(
    verificationId,
    { identityStatus, credentialNotes: credentialNotes ?? undefined, adminNotes: adminNotes ?? undefined, verifiedAt },
    await actorId()
  )
  redirect(`/consultants/${consultantId}`)
}

export async function createPayoutSetupAction(consultantId: string) {
  await createPayoutSetup(consultantId, await actorId())
  redirect(`/consultants/${consultantId}`)
}

export async function updatePayoutSetupAction(payoutSetupId: string, consultantId: string, formData: FormData) {
  const accountType = formData.get('accountType') as string | null
  const maskedAccount = formData.get('maskedAccount') as string | null
  const status = formData.get('status') as string
  const adminNotes = formData.get('adminNotes') as string | null
  await updatePayoutSetup(
    payoutSetupId,
    { accountType: accountType ?? undefined, maskedAccount: maskedAccount ?? undefined, status, adminNotes: adminNotes ?? undefined },
    await actorId()
  )
  redirect(`/consultants/${consultantId}`)
}
