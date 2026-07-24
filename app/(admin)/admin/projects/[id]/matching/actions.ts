'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { runMatching } from '@/modules/matching/service'
import { db } from '@/lib/db'
import { logEvent } from '@/modules/audit-events/service'
import type { Tx } from '@/lib/db'

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
  await db.$transaction(async (tx: Tx) => {
    const candidate = await tx.shortlistCandidate.create({
      data: {
        shortlistId,
        consultantId,
        addedBy: actor,
        aiFitTier,
        aiFitRationale,
      },
    })
    await logEvent(tx, { entityType: 'ShortlistCandidate', entityId: candidate.id, action: 'add_candidate', actorId: actor, actorRole: 'admin' })
  })
  redirect(`/admin/projects/${projectId}/matching?ran=1`)
}
