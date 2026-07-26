import { Resend } from 'resend'

const FROM = 'Consulten <noreply@consulten.co>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

async function send(to: string, subject: string, text: string) {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    await resend.emails.send({ from: FROM, to, subject, text })
  } catch (err) {
    console.error('[email] Failed to send:', subject, 'to', to, err)
  }
}

export async function sendInvitationEmail(opts: {
  consultantEmail: string
  consultantName: string
  projectTitle: string
  invitationId: string
  expiresAt: Date | null
}) {
  const expiry = opts.expiresAt ? opts.expiresAt.toLocaleDateString() : 'no expiry set'
  await send(
    opts.consultantEmail,
    "You've been invited to a project on Consulten",
    `Hi ${opts.consultantName},

You have a new project invitation waiting for you on Consulten.

Project: ${opts.projectTitle}
Expires: ${expiry}

Log in to review the scope and respond:
${APP_URL}/invitations/${opts.invitationId}

— The Consulten Team`
  )
}

export async function sendProposalSelectedEmail(opts: {
  consultantEmail: string
  consultantName: string
  projectTitle: string
  engagementId: string
}) {
  await send(
    opts.consultantEmail,
    'Your proposal was selected',
    `Hi ${opts.consultantName},

Your proposal has been selected for ${opts.projectTitle}. An engagement has been created.

Log in to get started:
${APP_URL}/engagements/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendEngagementStartedEmail(opts: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectId: string
}) {
  await send(
    opts.clientEmail,
    'Your engagement has started',
    `Hi ${opts.clientName},

A consultant has been selected for ${opts.projectTitle} and your engagement is now active.

Log in to track progress:
${APP_URL}/projects/${opts.projectId}

— The Consulten Team`
  )
}

export async function sendDeliverableSubmittedEmail(opts: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectId: string
  engagementId: string
}) {
  await send(
    opts.clientEmail,
    'A deliverable has been submitted for your review',
    `Hi ${opts.clientName},

A deliverable has been submitted for ${opts.projectTitle} and is ready for your review.

Log in to accept or request a revision:
${APP_URL}/projects/${opts.projectId}/engagement/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendDeliverableSubmittedAdminEmail(opts: {
  adminEmail: string
  projectTitle: string
  engagementId: string
}) {
  await send(
    opts.adminEmail,
    `Deliverable submitted — ${opts.projectTitle}`,
    `A consultant has submitted a deliverable for ${opts.projectTitle}.

Review it in the admin panel:
${APP_URL}/admin/engagements/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendAiQaCompleteEmail(opts: {
  clientEmail: string
  clientName: string
  projectTitle: string
  projectId: string
  engagementId: string
}) {
  await send(
    opts.clientEmail,
    `Deliverable ready for your review — ${opts.projectTitle}`,
    `Hi ${opts.clientName},

The deliverable for ${opts.projectTitle} has been reviewed and is ready for your acceptance.

Log in to review and accept or request a revision:
${APP_URL}/projects/${opts.projectId}/engagement/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendRevisionRequestedEmail(opts: {
  consultantEmail: string
  consultantName: string
  projectTitle: string
  engagementId: string
  reason: string
}) {
  await send(
    opts.consultantEmail,
    `Revision requested — ${opts.projectTitle}`,
    `Hi ${opts.consultantName},

The client has requested a revision for ${opts.projectTitle}.

Reason: ${opts.reason}

Log in to review and resubmit:
${APP_URL}/engagements/${opts.engagementId}

— The Consulten Team`
  )
}

export async function sendEngagementClosedEmail(opts: {
  email: string
  name: string
  projectTitle: string
  engagementId: string
  projectId: string
  role: 'client' | 'consultant'
}) {
  const link = opts.role === 'client'
    ? `${APP_URL}/projects/${opts.projectId}/engagement/${opts.engagementId}`
    : `${APP_URL}/engagements/${opts.engagementId}`
  await send(
    opts.email,
    `Engagement closed — ${opts.projectTitle}`,
    `Hi ${opts.name},

The engagement for ${opts.projectTitle} has been closed. Please take a moment to leave feedback.

Log in to leave feedback:
${link}

— The Consulten Team`
  )
}
