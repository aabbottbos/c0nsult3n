'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { approveProfile, publishProfile, suspendProfile } from '@/modules/consultants/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function approveProfileAction(id: string) {
  await approveProfile(id, await actorId())
  redirect(`/admin/consultants/${id}`)
}

export async function publishProfileAction(id: string) {
  await publishProfile(id, await actorId())
  redirect(`/admin/consultants/${id}`)
}

export async function suspendProfileAction(id: string) {
  await suspendProfile(id, await actorId())
  redirect(`/admin/consultants/${id}`)
}
