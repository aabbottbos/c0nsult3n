'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { moveToAdminReview, approveScope, requestClientChanges, confirmScope, rejectScope } from '@/modules/scopes/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function moveToAdminReviewAction(id: string) {
  await moveToAdminReview(id, await actorId())
  redirect(`/admin/scopes/${id}`)
}

export async function approveScopeAction(id: string) {
  await approveScope(id, await actorId())
  redirect(`/admin/scopes/${id}`)
}

export async function requestClientChangesAction(id: string) {
  await requestClientChanges(id, await actorId())
  redirect(`/admin/scopes/${id}`)
}

export async function confirmScopeAction(id: string) {
  await confirmScope(id, await actorId())
  redirect(`/admin/scopes/${id}`)
}

export async function rejectScopeAction(id: string) {
  await rejectScope(id, await actorId())
  redirect(`/admin/scopes/${id}`)
}
