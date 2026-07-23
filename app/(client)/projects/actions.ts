'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProject, submitProject } from '@/modules/projects/service'
import { confirmScope, requestClientChanges } from '@/modules/scopes/service'
import { selectProposal } from '@/modules/proposals/service'
import { acceptEngagement, requestRevision } from '@/modules/engagements/service'

async function dbUserId() {
  await requireRole('client')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  return user.id
}

export async function createProjectAction(formData: FormData) {
  const uid = await dbUserId()
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: uid } })
  const project = await createProject({ clientId: contact.organizationId, title, description }, uid)
  await submitProject(project.id, uid)
  redirect(`/projects/${project.id}`)
}

export async function confirmScopeAction(scopeId: string, projectId: string) {
  const uid = await dbUserId()
  await confirmScope(scopeId, uid)
  redirect(`/projects/${projectId}`)
}

export async function requestScopeChangesAction(scopeId: string, projectId: string) {
  const uid = await dbUserId()
  await requestClientChanges(scopeId, uid)
  redirect(`/projects/${projectId}`)
}

export async function selectProposalAction(proposalId: string, projectId: string) {
  const uid = await dbUserId()
  await selectProposal(proposalId, uid)
  redirect(`/projects/${projectId}`)
}

export async function acceptDeliverableAction(engagementId: string, projectId: string) {
  const uid = await dbUserId()
  await acceptEngagement(engagementId, uid)
  redirect(`/projects/${projectId}`)
}

export async function requestRevisionAction(engagementId: string, deliverableId: string, reason: string, projectId: string) {
  const uid = await dbUserId()
  const { createRevisionRequest } = await import('@/modules/deliverables/service')
  await createRevisionRequest(engagementId, deliverableId, reason, uid)
  await requestRevision(engagementId, uid)
  redirect(`/projects/${projectId}`)
}
