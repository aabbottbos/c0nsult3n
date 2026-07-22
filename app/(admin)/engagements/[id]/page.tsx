import { notFound } from 'next/navigation'
import { getEngagement } from '@/modules/engagements/service'
import { db } from '@/lib/db'
import { startEngagementAction, submitDeliverableAction, beginReviewAction, acceptEngagementAction, closeEngagementAction, cancelEngagementAction } from '../actions'
import { ENGAGEMENT_TRANSITIONS } from '@/modules/engagements/types'

export default async function EngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const engagement = await getEngagement(id)
  if (!engagement) notFound()

  const project = await db.project.findUnique({ where: { id: engagement.projectId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })
  const allowed = ENGAGEMENT_TRANSITIONS[engagement.status]

  return (
    <div className="p-8 space-y-6">
      <a href="/admin/engagements" className="text-sm text-indigo-600 hover:underline">← Engagements</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Engagement</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Project</dt><dd><a href={`/admin/projects/${engagement.projectId}`} className="text-indigo-600 hover:underline">{project?.title ?? engagement.projectId}</a></dd></div>
          <div><dt className="text-slate-500">Scope</dt><dd><a href={`/admin/scopes/${engagement.scopeId}`} className="text-indigo-600 hover:underline">{engagement.scopeId.slice(0, 12)}…</a></dd></div>
          <div><dt className="text-slate-500">Proposal</dt><dd><a href={`/admin/proposals/${engagement.proposalId}`} className="text-indigo-600 hover:underline">{engagement.proposalId.slice(0, 12)}…</a></dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('IN_PROGRESS') && (
            <form action={startEngagementAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Start</button>
            </form>
          )}
          {allowed.includes('DELIVERABLE_SUBMITTED') && (
            <form action={submitDeliverableAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit Deliverable</button>
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
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Close</button>
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

      {engagement.deliverables.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Deliverables</h2>
          <ul className="space-y-2">
            {engagement.deliverables.map(d => (
              <li key={d.id} className="text-sm text-slate-700">
                <a href={`/admin/deliverables/${d.id}`} className="text-indigo-600 hover:underline">{d.id.slice(0, 12)}…</a>
                <span className="ml-2 text-slate-500">{d.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

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
