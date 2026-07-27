export type NotificationInput = {
  recipientId: string
  type: 'INVITATION_SENT' | 'PROPOSAL_SELECTED' | 'ENGAGEMENT_STARTED' | 'DELIVERABLE_SUBMITTED' | 'AI_QA_COMPLETE' | 'REVISION_REQUESTED' | 'ENGAGEMENT_CLOSED'
  body: string
  link: string
}
