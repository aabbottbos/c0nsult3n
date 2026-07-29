import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { acceptDeliverableAction, requestRevisionAction, sendMessageAction, createFeedbackAction } from '../../../actions'

const COMM_TYPES = ['CLARIFICATION', 'DOCUMENT_REQUEST', 'REVISION_RESPONSE', 'ISSUE_FLAG'] as const
const COMM_LABELS: Record<string, string> = {
  CLARIFICATION: 'Clarification',
  DOCUMENT_REQUEST: 'Document request',
  REVISION_RESPONSE: 'Revision response',
  ISSUE_FLAG: 'Issue flag',
}

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

export default async function ClientEngagementDetailPage({ params }: { params: Promise<{ id: string; engagementId: string }> }) {
  const { id, engagementId } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, clientContactId: contact.id },
    include: {
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      project: true,
      feedbacks: { where: { submittedBy: user.id } },
      paymentRecord: { select: { amount: true, paymentStatus: true } },
    },
  })
  if (!engagement) notFound()

  const latestDeliverable = engagement.deliverables[0] ?? null
  const hasFeedback = engagement.feedbacks.length > 0
  const blocked = latestDeliverable?.aiQaRiskFlag === true

  return (
    <div className="p-8 space-y-6">
      <a href={`/projects/${engagement.projectId}`} className="text-sm text-brand-600 hover:text-brand-700">← {engagement.project.title}</a>
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-display font-semibold text-ink-900">Engagement</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-600">{humanStatus(engagement.status)}</span>
      </div>

      <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-3">
        <h2 className="text-sm font-semibold text-ink-700">Scope</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-ink-400">Deliverable</dt><dd className="text-ink-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div><dt className="text-ink-400">Fee</dt><dd className="font-mono text-ink-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-ink-400">Effort cap</dt><dd className="font-mono text-ink-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-ink-400">Due date</dt><dd className="text-ink-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {engagement.paymentRecord && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-2 text-sm">
          <h2 className="font-semibold text-ink-700">Payment</h2>
          <div className="flex gap-6">
            <div><p className="text-ink-400">Amount</p><p className="font-mono text-ink-900">${engagement.paymentRecord.amount.toString()}</p></div>
            <div><p className="text-ink-400">Status</p><p className="text-ink-900">{humanStatus(engagement.paymentRecord.paymentStatus)}</p></div>
          </div>
        </div>
      )}

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-700">Deliverable</h2>
          <div className="text-sm text-ink-600 space-y-2">
            <p>Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'}</p>
            {latestDeliverable.fileUrl && <a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:text-brand-700 break-all block">{latestDeliverable.fileUrl}</a>}
            {latestDeliverable.consultantNotes && (
              <div className="p-3 bg-surface-subtle border border-ink-100 rounded-lg">
                <p className="text-xs font-medium text-ink-400 mb-1">Consultant notes</p>
                <p className="text-ink-700">{latestDeliverable.consultantNotes}</p>
              </div>
            )}
            {latestDeliverable.aiQaRunAt && latestDeliverable.aiQaNotes && (
              <div className="p-3 bg-teal-50 border border-teal-100 rounded-lg">
                <p className="text-xs font-medium text-teal-700 mb-1">AI QA review</p>
                <p className="text-ink-700">{latestDeliverable.aiQaNotes}</p>
              </div>
            )}
          </div>

          {engagement.status === 'UNDER_REVIEW' && (
            <div className="flex flex-col gap-3 pt-2 border-t border-ink-100">
              {blocked ? (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">Under admin review — acceptance temporarily blocked.</p>
              ) : (
                <form action={acceptDeliverableAction.bind(null, engagementId, id)}>
                  <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Accept deliverable</button>
                </form>
              )}
              <form action={requestRevisionAction.bind(null, engagementId, latestDeliverable.id, id)} className="space-y-2">
                <textarea name="reason" required rows={2} placeholder="Describe the revision needed…" className="w-full text-sm border border-ink-200 rounded-md px-3 py-2 text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
                <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-red-600 text-white hover:opacity-90 transition-opacity">Request revision</button>
              </form>
            </div>
          )}
        </div>
      )}

      {engagement.status === 'CLOSED' && !hasFeedback && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-700">Leave feedback</h2>
          <form action={createFeedbackAction.bind(null, engagementId, id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Satisfaction (1–5)</label>
              <select name="satisfaction" required className="border border-ink-200 rounded-md px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Would you work with this consultant again?</label>
              <select name="repeatIntent" required className="border border-ink-200 rounded-md px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Comments (optional)</label>
              <textarea name="comments" rows={3} className="w-full text-sm border border-ink-200 rounded-md px-3 py-2 text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
            </div>
            <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Submit feedback</button>
          </form>
        </div>
      )}

      {engagement.status === 'CLOSED' && hasFeedback && (
        <div className="bg-teal-50 rounded-lg border border-teal-100 p-4">
          <p className="text-sm text-teal-700">Feedback submitted. Thank you.</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
        <h2 className="text-sm font-semibold text-ink-700">Messages</h2>
        {engagement.communications.length > 0 && (
          <ul className="space-y-3 mb-4">
            {engagement.communications.map(m => (
              <li key={m.id} className={`text-sm rounded-lg p-3 border ${m.senderRole === 'client' ? 'bg-brand-50 border-brand-100' : 'bg-surface-subtle border-ink-100'}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-600">{COMM_LABELS[m.messageType] ?? m.messageType}</span>
                  <span className="font-medium text-ink-700 capitalize">{m.senderRole}</span>
                  <span className="text-ink-400 text-xs">{m.createdAt.toLocaleString()}</span>
                </div>
                <p className="text-ink-600">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form action={sendMessageAction.bind(null, engagementId, id)} className="space-y-3">
          <select name="messageType" required className="border border-ink-200 rounded-md px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500">
            {COMM_TYPES.map(t => <option key={t} value={t}>{COMM_LABELS[t]}</option>)}
          </select>
          <textarea name="body" required rows={3} placeholder="Message…" className="w-full text-sm border border-ink-200 rounded-md px-3 py-2 text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500" />
          <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Send</button>
        </form>
      </div>
    </div>
  )
}
