import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { ENGAGEMENT_TRANSITIONS } from '@/modules/engagements/types'
import { startEngagementAction, beginReviewAction, acceptEngagementAction, closeEngagementAction, cancelEngagementAction, resolveAdminTaskAction, updateRevisionRequestAction, sendMessageAction } from '../actions'

const COMM_TYPES = ['CLARIFICATION', 'DOCUMENT_REQUEST', 'REVISION_RESPONSE', 'ISSUE_FLAG'] as const
const COMM_LABELS: Record<string, string> = {
  CLARIFICATION: 'Clarification',
  DOCUMENT_REQUEST: 'Document Request',
  REVISION_RESPONSE: 'Revision Response',
  ISSUE_FLAG: 'Issue Flag',
}

export default async function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const engagement = await db.engagement.findUnique({
    where: { id },
    include: {
      project: true,
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      revisionRequests: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!engagement) notFound()

  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })
  const allowed = ENGAGEMENT_TRANSITIONS[engagement.status]
  const latestDeliverable = engagement.deliverables[0] ?? null
  const openRevision = engagement.revisionRequests.find(r => r.status === 'OPEN') ?? null

  const openAdminTask = latestDeliverable?.aiQaRiskFlag
    ? await db.adminTask.findFirst({ where: { deliverableId: latestDeliverable.id, resolved: false } })
    : null

  return (
    <div className="p-8 space-y-6">
      <a href="/admin/engagements" className="text-sm text-indigo-600 hover:underline">← Engagements</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{engagement.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2 text-sm">
        <h2 className="font-semibold text-slate-700 mb-2">Details</h2>
        <p><span className="text-slate-500">Scope:</span> {engagement.scope.deliverable}</p>
        <p><span className="text-slate-500">Acceptance criteria:</span> {engagement.scope.acceptanceCriteria}</p>
        <p><span className="text-slate-500">Fee:</span> ${engagement.scope.fee.toString()}</p>
        <p><span className="text-slate-500">Due:</span> {engagement.scope.dueDate.toLocaleDateString()}</p>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-700">Latest Deliverable</h2>
            {latestDeliverable.aiQaRiskFlag && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">AI QA Risk Flag</span>
            )}
          </div>
          <div className="text-sm text-slate-600 space-y-2">
            <p>Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'} · Status: {latestDeliverable.status}</p>
            {latestDeliverable.fileUrl && <a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all block">{latestDeliverable.fileUrl}</a>}
            {latestDeliverable.consultantNotes && (
              <div className="p-3 bg-slate-50 rounded">
                <p className="text-xs font-medium text-slate-500 mb-1">Consultant notes</p>
                <p>{latestDeliverable.consultantNotes}</p>
              </div>
            )}
            {latestDeliverable.aiQaRunAt ? (
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-xs font-medium text-blue-600 mb-1">AI QA Notes</p>
                <p>{latestDeliverable.aiQaNotes}</p>
              </div>
            ) : (
              <p className="text-slate-400 text-xs">AI QA running…</p>
            )}
          </div>
          {openAdminTask && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded flex items-center justify-between">
              <p className="text-sm text-amber-800">Admin task: {openAdminTask.reason}</p>
              <form action={resolveAdminTaskAction.bind(null, openAdminTask.id, id)}>
                <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700">Mark Resolved</button>
              </form>
            </div>
          )}
        </div>
      )}

      {openRevision && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Open Revision Request</h2>
          <p className="text-sm text-slate-600"><span className="font-medium">Reason:</span> {openRevision.reason}</p>
          <form action={updateRevisionRequestAction.bind(null, openRevision.id, id)} className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700">In-scope:</label>
              <select name="inScopeConfirmation" defaultValue={openRevision.inScopeConfirmation ? 'true' : 'false'} className="text-sm border border-slate-300 rounded px-2 py-1">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-700">Due date:</label>
              <input type="date" name="dueDate" defaultValue={openRevision.dueDate?.toISOString().split('T')[0] ?? ''} className="text-sm border border-slate-300 rounded px-2 py-1" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Save</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('IN_PROGRESS') && (
            <form action={startEngagementAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Start</button>
            </form>
          )}
          {allowed.includes('UNDER_REVIEW') && (
            <form action={beginReviewAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Begin Review</button>
            </form>
          )}
          {allowed.includes('ACCEPTED') && (
            <form action={acceptEngagementAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept</button>
            </form>
          )}
          {allowed.includes('CLOSED') && (
            <form action={closeEngagementAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700">Close Engagement</button>
            </form>
          )}
          {allowed.includes('CANCELLED') && (
            <form action={cancelEngagementAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Cancel</button>
            </form>
          )}
          {allowed.length === 0 && <p className="text-sm text-slate-400">No actions available.</p>}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Communications</h2>
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
        <form action={sendMessageAction.bind(null, id)} className="space-y-3">
          <select name="messageType" required className="text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500">
            {COMM_TYPES.map(t => <option key={t} value={t}>{COMM_LABELS[t]}</option>)}
          </select>
          <textarea name="body" required rows={3} placeholder="Message…" className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
          <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Send</button>
        </form>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Event Log</h2>
        {events.length === 0 ? <p className="text-sm text-slate-400">No events.</p> : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="text-xs text-slate-600">
                <span className="font-medium">{e.action}</span> by {e.actorRole} · {e.timestamp.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
