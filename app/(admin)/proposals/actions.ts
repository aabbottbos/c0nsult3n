'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { reviewDeviations } from '@/modules/proposals/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function approveDeviationsAction(id: string) {
  await reviewDeviations(id, true, await actorId())
  redirect(`/proposals/${id}`)
}

export async function rejectDeviationsAction(id: string) {
  await reviewDeviations(id, false, await actorId())
  redirect(`/proposals/${id}`)
}
