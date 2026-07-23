'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProposal } from '@/modules/proposals/service'
import { declineInvitation } from '@/modules/invitations/service'

async function consultantProfileId() {
  await requireRole('consultant')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })
  return { userId: user.id, profileId: profile.id }
}

export async function submitProposalAction(invitationId: string, formData: FormData) {
  const { profileId } = await consultantProfileId()
  const fitStatement = formData.get('fitStatement') as string
  await createProposal({ invitationId, consultantId: profileId, fitStatement }, profileId)
  redirect(`/invitations/${invitationId}`)
}

export async function declineInvitationAction(invitationId: string) {
  const { profileId } = await consultantProfileId()
  await declineInvitation(invitationId, profileId)
  redirect('/invitations')
}
