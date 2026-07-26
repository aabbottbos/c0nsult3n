import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { acceptDeliverableAction, requestRevisionAction, sendMessageAction, createFeedbackAction } from '../../../actions'

const COMM_TYPES = ['CLARIFICATION', 'DOCUMENT_REQUEST', 'REVISION_RESPONSE', 'ISSUE_FLAG'] as const
const COMM_LABELS: Record<string, string> = {
  CLARIFICATION: 'Clarification',
  DOCUMENT_REQUEST: 'Document Request',
  REVISION_RESPONSE: 'Revision Response',
  ISSUE_FLAG: 'Issue Flag',
}

export default async function ClientEngagementDetailPage({ params }: { params: Promise<{ id: string; engagementId: string }> }) {
  const { id, engagementId } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, clientId: contact.organizationId },
    include: {
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      project: true,
      feedbacks: { where: { submittedBy: user.id } },
    },
  })
  if (!engagement) notFound()

  const latestDeliverable = engagement.deliverables[0] ?? null
  const hasFeedback = engagement.feedbacks.length > 0
  const blocked = latestDeliverable?.aiQaRiskFlag === true

  return (
    <div className="p-8 space-y-6">
      <a href={`/projects/${engagement.projectId}`} className="text-sm text-indigo-600 hover:underline">← {engagement.project.title}</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Engagement</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Deliverable</h2>
          <div className="text-sm text-slate-600 space-y-2">
            <p>Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'}</p>
            {latestDeliverable.fileUrl && <a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all block">{latestDeliverable.fileUrl}</a>}
            {latestDeliverable.consultantNotes && (
              <div className="p-3 bg-slate-50 rounded">
                <p className="text-xs font-medium text-slate-500 mb-1">Consultant notes</p>
                <p className="text-slate-700">{latestDeliverable.consultantNotes}</p>
              </div>
            )}
            {latestDeliverable.aiQaRunAt && latestDeliverable.aiQaNotes && (
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-xs font-medium text-blue-600 mb-1">AI QA Review</p>
                <p className="text-slate-700">{latestDeliverable.aiQaNotes}</p>
              </div>
            )}
          </div>

          {engagement.status === 'UNDER_REVIEW' && (
            <div className="flex flex-col gap-3 pt-2 border-t border-slate-100">
              {blocked ? (
                <p className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-2">Under admin review — acceptance temporarily blocked.</p>
              ) : (
                <form action={acceptDeliverableAction.bind(null, engagementId, id)}>
                  <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Deliverable</button>
                </form>
              )}
              <form action={requestRevisionAction.bind(null, engagementId, latestDeliverable.id, id)} className="space-y-2">
                <textarea name="reason" required rows={2} placeholder="Describe the revision needed…" className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500" />
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Request Revision</button>
              </form>
            </div>
          )}
        </div>
      )}

      {engagement.status === 'CLOSED' && !hasFeedback && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Leave Feedback</h2>
          <form action={createFeedbackAction.bind(null, engagementId, id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Satisfaction (1–5)</label>
              <select name="satisfaction" required className="text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Would you work with this consultant again?</label>
              <select name="repeatIntent" required className="text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Comments (optional)</label>
              <textarea name="comments" rows={3} className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit Feedback</button>
          </form>
        </div>
      )}

      {engagement.status === 'CLOSED' && hasFeedback && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4">
          <p className="text-sm text-green-700">Feedback submitted. Thank you.</p>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Messages</h2>
        {engagement.communications.length > 0 && (
          <ul className="space-y-3 mb-4">
            {engagement.communications.map(m => (
              <li key={m.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{COMM_LABELS[m.messageType] ?? m.messageType}</span>
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs">{m.createdAt.toLocaleString()}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form action={sendMessageAction.bind(null, engagementId, id)} className="space-y-3">
          <select name="messageType" required className="text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {COMM_TYPES.map(t => <option key={t} value={t}>{COMM_LABELS[t]}</option>)}
          </select>
          <textarea name="body" required rows={3} placeholder="Message…" className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Send</button>
        </form>
      </div>
    </div>
  )
}
