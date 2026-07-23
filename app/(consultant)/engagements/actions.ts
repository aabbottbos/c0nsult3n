'use server'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { db } from '@/lib/db'
import { submitDeliverable } from '@/modules/engagements/service'
import { logEvent } from '@/modules/audit-events/service'
import { sendDeliverableSubmittedEmail } from '@/lib/email'
import { put } from '@vercel/blob'

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
  const file = formData.get('file') as File | null

  let fileUrl: string | null = null
  if (file && file.size > 0) {
    const blob = await put(`${engagementId}/${file.name}`, file, { access: 'public' })
    fileUrl = blob.url
  }

  await db.$transaction(async (tx) => {
    const d = await tx.deliverable.create({
      data: { engagementId, status: 'SUBMITTED', submittedAt: new Date(), fileUrl },
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
      clientEmail: clientContact.email,
      clientName: clientContact.name,
      projectTitle: eng.project.title,
      projectId: eng.projectId,
      engagementId: eng.id,
    })
  }

  redirect(`/engagements/${engagementId}`)
}
