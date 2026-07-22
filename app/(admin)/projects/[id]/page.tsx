import { notFound } from 'next/navigation'
import { getProject } from '@/modules/projects/service'
import { db } from '@/lib/db'
import {
  submitProjectAction,
  startAdminReviewAction,
  markNeedsClarificationAction,
  markReadyForMatchingAction,
  markMatchingInProgressAction,
  cancelProjectAction,
} from '../actions'
import { PROJECT_TRANSITIONS } from '@/modules/projects/types'

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const events = await db.eventLog.findMany({
    where: { entityId: id },
    orderBy: { timestamp: 'desc' },
    take: 20,
  })

  const allowed = PROJECT_TRANSITIONS[project.status]

  return (
    <div className="p-8 space-y-6">
      <a href="/admin/projects" className="text-sm text-indigo-600 hover:underline">← Projects</a>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{project.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{project.description}</p>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{project.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Client</dt><dd className="text-slate-900">{project.client.name}</dd></div>
          <div><dt className="text-slate-500">ID</dt><dd className="text-slate-900 font-mono text-xs">{project.id}</dd></div>
          <div><dt className="text-slate-500">Created</dt><dd className="text-slate-900">{project.createdAt.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('SUBMITTED') && (
            <form action={submitProjectAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
            </form>
          )}
          {allowed.includes('UNDER_ADMIN_REVIEW') && (
            <form action={startAdminReviewAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Start Admin Review</button>
            </form>
          )}
          {allowed.includes('NEEDS_CLARIFICATION') && (
            <form action={markNeedsClarificationAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Needs Clarification</button>
            </form>
          )}
          {allowed.includes('READY_FOR_MATCHING') && (
            <form action={markReadyForMatchingAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Ready for Matching</button>
            </form>
          )}
          {allowed.includes('MATCHING_IN_PROGRESS') && (
            <form action={markMatchingInProgressAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Start Matching</button>
            </form>
          )}
          {allowed.includes('CANCELLED') && (
            <form action={cancelProjectAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Cancel</button>
            </form>
          )}
          {allowed.length === 0 && <p className="text-sm text-slate-400">No actions available.</p>}
        </div>
      </div>

      {project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Scope</h2>
          <a href={`/admin/scopes/${project.scope.id}`} className="text-sm text-indigo-600 hover:underline">
            {project.scope.deliverable} · <span className="text-slate-500">{project.scope.status}</span>
          </a>
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
