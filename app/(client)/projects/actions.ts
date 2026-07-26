'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { createProject, submitProject } from '@/modules/projects/service'
import { confirmScope, requestClientChanges } from '@/modules/scopes/service'
import { selectProposal } from '@/modules/proposals/service'
import { acceptEngagement, requestRevision } from '@/modules/engagements/service'
import { createRevisionRequest, createFeedback } from '@/modules/deliverables/service'
import { sendMessage } from '@/modules/communications/service'
import { sendRevisionRequestedEmail } from '@/lib/email'
import type { CommunicationType } from '@/app/generated/prisma'

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
  redirect(`/projects/${projectId}/engagement/${engagementId}`)
}

export async function requestRevisionAction(engagementId: string, deliverableId: string, projectId: string, formData: FormData) {
  const uid = await dbUserId()
  const reason = formData.get('reason') as string
  await createRevisionRequest(engagementId, deliverableId, reason, uid)
  await requestRevision(engagementId, uid)

  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: { consultant: { include: { user: true } }, project: true },
  })
  await sendRevisionRequestedEmail({
    consultantEmail: eng.consultant.user.email,
    consultantName: eng.consultant.user.email,
    projectTitle: eng.project.title,
    engagementId,
    reason,
  })

  redirect(`/projects/${projectId}/engagement/${engagementId}`)
}

export async function sendMessageAction(engagementId: string, projectId: string, formData: FormData) {
  const uid = await dbUserId()
  const messageType = formData.get('messageType') as CommunicationType
  const body = formData.get('body') as string
  await sendMessage(engagementId, uid, 'client', messageType, body)
  redirect(`/projects/${projectId}/engagement/${engagementId}`)
}

export async function createFeedbackAction(engagementId: string, projectId: string, formData: FormData) {
  const uid = await dbUserId()
  const satisfaction = parseInt(formData.get('satisfaction') as string, 10)
  const repeatIntent = formData.get('repeatIntent') === 'true'
  const comments = (formData.get('comments') as string | null) || null
  await createFeedback(engagementId, uid, 'client', satisfaction, repeatIntent, comments)
  redirect(`/projects/${projectId}/engagement/${engagementId}`)
}
