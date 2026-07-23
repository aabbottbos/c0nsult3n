'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { submitDeliverable } from '@/modules/engagements/service'
import { logEvent } from '@/modules/audit-events/service'
import { sendDeliverableSubmittedEmail } from '@/lib/email'

async function consultantProfileId() {
  await requireRole('consultant')
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })
  return profile.id
}

export async function submitDeliverableAction(engagementId: string, formData: FormData) {
  const profileId = await consultantProfileId()
  const fileUrl = formData.get('fileUrl') as string

  await db.$transaction(async (tx) => {
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl: fileUrl || null },
    })
    await logEvent(tx, { entityType: 'Deliverable', entityId: d.id, action: 'create', actorId: profileId, actorRole: 'consultant' })
  })

  await submitDeliverable(engagementId, profileId)

  // Fire email after state transition — failure must not block redirect
  const eng = await db.engagement.findUniqueOrThrow({
    where: { id: engagementId },
    include: {
      project: {
        include: {
          client: { include: { contacts: true } },
        },
      },
    },
  })
  const clientContact = eng.project.client.contacts[0]
  if (clientContact) {
    await sendDeliverableSubmittedEmail({
      clientEmail: clientContact.user.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.projectId,
      engagementId: eng.id,
    })
  }

  redirect(`/engagements/${engagementId}`)
}
