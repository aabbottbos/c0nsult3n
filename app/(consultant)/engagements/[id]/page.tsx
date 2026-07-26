import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitDeliverableAction, resubmitDeliverableAction, sendMessageAction, createFeedbackAction } from '../actions'

const COMM_TYPES = ['CLARIFICATION', 'DOCUMENT_REQUEST', 'REVISION_RESPONSE', 'ISSUE_FLAG'] as const
const COMM_LABELS: Record<string, string> = {
  CLARIFICATION: 'Clarification',
  DOCUMENT_REQUEST: 'Document Request',
  REVISION_RESPONSE: 'Revision Response',
  ISSUE_FLAG: 'Issue Flag',
}

export default async function ConsultantEngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id, consultantId: profile.id },
    include: {
      project: true,
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      revisionRequests: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 1 },
      feedbacks: { where: { submittedBy: user.id } },
      paymentRecord: { select: { payoutAmount: true, payoutStatus: true } },
    },
  })
  if (!engagement) notFound()

  const canSubmit = engagement.status === 'IN_PROGRESS' && engagement.revisionRequests.length === 0
  const canResubmit = engagement.status === 'REVISION_REQUESTED' && engagement.revisionRequests.length > 0
  const openRevision = engagement.revisionRequests[0] ?? null
  const latestDeliverable = engagement.deliverables[0] ?? null
  const hasFeedback = engagement.feedbacks.length > 0

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <a href="/engagements" className="text-sm text-indigo-600 hover:underline">← Engagements</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{engagement.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.acceptanceCriteria}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {engagement.paymentRecord && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2 text-sm">
          <h2 className="font-semibold text-slate-700">Payout</h2>
          <div className="flex gap-6">
            <div><p className="text-slate-500">Payout amount</p><p className="font-medium">{engagement.paymentRecord.payoutAmount ? `$${engagement.paymentRecord.payoutAmount.toString()}` : 'TBD'}</p></div>
            <div><p className="text-slate-500">Status</p><p className="font-medium">{engagement.paymentRecord.payoutStatus}</p></div>
          </div>
        </div>
      )}

      {canSubmit && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Submit Deliverable</h2>
          <form action={submitDeliverableAction.bind(null, engagement.id)} encType="multipart/form-data" className="space-y-4">
            <div>
              <label htmlFor="file-input" className="block text-sm font-medium text-slate-700 mb-1">Deliverable file</label>
              <input id="file-input" name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip" className="w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </div>
            <div>
              <label htmlFor="notes-input" className="block text-sm font-medium text-slate-700 mb-1">Work summary <span className="text-red-500">*</span></label>
              <textarea id="notes-input" name="consultantNotes" required rows={4} placeholder="Describe what you completed and how it meets the acceptance criteria." className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
          </form>
        </div>
      )}

      {canResubmit && openRevision && (
        <div className="bg-amber-50 rounded-lg border border-amber-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-amber-800">Revision Requested</h2>
          <p className="text-sm text-amber-700"><span className="font-medium">Reason:</span> {openRevision.reason}</p>
          {openRevision.dueDate && <p className="text-sm text-amber-700"><span className="font-medium">Due:</span> {openRevision.dueDate.toLocaleDateString()}</p>}
          <p className="text-xs text-amber-600">In-scope: {openRevision.inScopeConfirmation ? 'Yes' : 'No'}</p>
          <form action={resubmitDeliverableAction.bind(null, engagement.id, openRevision.id)} encType="multipart/form-data" className="space-y-4 pt-2 border-t border-amber-200">
            <h3 className="text-sm font-semibold text-slate-700">Resubmit</h3>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Updated file</label>
              <input name="file" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.zip" className="w-full text-sm text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Updated work summary <span className="text-red-500">*</span></label>
              <textarea name="consultantNotes" required rows={4} placeholder="Describe the revisions you made." className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-amber-600 text-white hover:bg-amber-700">Resubmit</button>
          </form>
        </div>
      )}

      {latestDeliverable && !canSubmit && !canResubmit && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Latest Deliverable</h2>
          <div className="text-sm text-slate-600 space-y-2">
            <p>Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'}</p>
            {latestDeliverable.fileUrl && <a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all block">{latestDeliverable.fileUrl}</a>}
            {latestDeliverable.aiQaRunAt
              ? <div className="mt-2 p-3 bg-slate-50 rounded text-xs text-slate-700"><span className="font-medium">AI QA:</span> {latestDeliverable.aiQaNotes}</div>
              : <p className="text-slate-400 text-xs">AI QA running…</p>
            }
          </div>
        </div>
      )}

      {engagement.status === 'CLOSED' && !hasFeedback && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Leave Feedback</h2>
          <form action={createFeedbackAction.bind(null, engagement.id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Satisfaction (1–5)</label>
              <select name="satisfaction" required className="text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Would you work with this client again?</label>
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
        <form action={sendMessageAction.bind(null, engagement.id)} className="space-y-3">
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
