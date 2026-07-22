import { notFound } from 'next/navigation'
import { getScope } from '@/modules/scopes/service'
import { db } from '@/lib/db'
import { moveToAdminReviewAction, approveScopeAction, requestClientChangesAction, confirmScopeAction, rejectScopeAction } from '../actions'
import { SCOPE_TRANSITIONS } from '@/modules/scopes/types'

export default async function ScopeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scope = await getScope(id)
  if (!scope) notFound()

  const project = await db.project.findUnique({ where: { id: scope.projectId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })
  const allowed = SCOPE_TRANSITIONS[scope.status]

  return (
    <div className="p-8 space-y-6">
      <a href="/admin/scopes" className="text-sm text-indigo-600 hover:underline">← Scopes</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{scope.deliverable}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{scope.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Project</dt><dd><a href={`/admin/projects/${scope.projectId}`} className="text-indigo-600 hover:underline">{project?.title ?? scope.projectId}</a></dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900">${scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900">{scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900">{scope.dueDate.toLocaleDateString()}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900">{scope.acceptanceCriteria}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Assumptions</dt><dd className="text-slate-900">{scope.assumptions}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Exclusions</dt><dd className="text-slate-900">{scope.exclusions}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('ADMIN_REVIEW') && (
            <form action={moveToAdminReviewAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Move to Admin Review</button>
            </form>
          )}
          {allowed.includes('ADMIN_APPROVED') && (
            <form action={approveScopeAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Approve</button>
            </form>
          )}
          {allowed.includes('CLIENT_CHANGE_REQUESTED') && (
            <form action={requestClientChangesAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Request Client Changes</button>
            </form>
          )}
          {allowed.includes('CLIENT_CONFIRMED') && (
            <form action={confirmScopeAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Confirm (as Client)</button>
            </form>
          )}
          {allowed.includes('REJECTED') && (
            <form action={rejectScopeAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Reject</button>
            </form>
          )}
          {allowed.length === 0 && <p className="text-sm text-slate-400">No actions available.</p>}
        </div>
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
