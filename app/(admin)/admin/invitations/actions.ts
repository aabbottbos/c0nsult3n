'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { sendInvitation, acceptInterest, declineInvitation, expireInvitation } from '@/modules/invitations/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function sendInvitationAction(id: string) {
  await sendInvitation(id, await actorId())
  redirect(`/admin/invitations/${id}`)
}

export async function acceptInterestAction(id: string) {
  await acceptInterest(id, await actorId())
  redirect(`/admin/invitations/${id}`)
}

export async function declineInvitationAction(id: string) {
  await declineInvitation(id, await actorId())
  redirect(`/admin/invitations/${id}`)
}

export async function expireInvitationAction(id: string) {
  await expireInvitation(id, await actorId())
  redirect(`/admin/invitations/${id}`)
}
