'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { runMatching } from '@/modules/matching/service'
import { addCandidateWithAI } from '@/modules/shortlists/service'

async function actorId() {
  await requireRole('admin')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return userId
}

export async function runMatchingAction(projectId: string) {
  const actor = await actorId()
  await runMatching(projectId, actor)
  redirect(`/admin/projects/${projectId}/matching?ran=1`)
}

export async function addCandidateAction(
  shortlistId: string,
  consultantId: string,
  projectId: string,
  aiFitTier: string | null,
  aiFitRationale: string | null,
) {
  const actor = await actorId()
  await addCandidateWithAI(shortlistId, consultantId, actor, aiFitTier, aiFitRationale)
  redirect(`/admin/projects/${projectId}/matching?ran=1`)
}
