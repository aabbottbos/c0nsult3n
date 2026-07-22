'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { submitForAdminReview, makeClientVisible, closeShortlist } from '@/modules/shortlists/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function submitForAdminReviewAction(id: string) {
  await submitForAdminReview(id, await actorId())
  redirect(`/admin/shortlists/${id}`)
}

export async function makeClientVisibleAction(id: string) {
  await makeClientVisible(id, await actorId())
  redirect(`/admin/shortlists/${id}`)
}

export async function closeShortlistAction(id: string) {
  await closeShortlist(id, await actorId())
  redirect(`/admin/shortlists/${id}`)
}
