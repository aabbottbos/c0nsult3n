'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { selectProposal } from '@/modules/proposals/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function selectProposalAction(id: string) {
  await selectProposal(id, await actorId())
  redirect(`/proposals/${id}`)
}
