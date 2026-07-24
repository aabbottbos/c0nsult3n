import { notFound } from 'next/navigation'
import { getShortlist } from '@/modules/shortlists/service'
import { db } from '@/lib/db'
import { submitForAdminReviewAction, makeClientVisibleAction, closeShortlistAction, generateMatchRationaleAction, createAndSendInvitationAction } from '../actions'
import { SHORTLIST_TRANSITIONS } from '@/modules/shortlists/types'

export default async function ShortlistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const shortlist = await getShortlist(id)
  if (!shortlist) notFound()

  const project = await db.project.findUnique({ where: { id: shortlist.projectId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })
  const allowed = SHORTLIST_TRANSITIONS[shortlist.status]

  return (
    <div className="p-8 space-y-6">
      <a href="/shortlists" className="text-sm text-indigo-600 hover:underline">← Shortlists</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Shortlist — {project?.title ?? shortlist.projectId}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{shortlist.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Candidates ({shortlist.candidates.length})</h2>
        {shortlist.candidates.length === 0 ? <p className="text-sm text-slate-400">No candidates yet.</p> : (
          <ul className="space-y-3 divide-y divide-slate-100">
            {shortlist.candidates.map(c => (
              <li key={c.id} className="pt-3 first:pt-0 space-y-1">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-0.5">
                    <a href={`/consultants/${c.consultantId}`} className="text-sm text-indigo-600 hover:underline">{c.consultantId.slice(0, 12)}…</a>
                    {c.aiFitTier && (
                      <span className={`ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                        c.aiFitTier === 'HIGH' ? 'bg-green-100 text-green-700' :
                        c.aiFitTier === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-slate-100 text-slate-500'
                      }`}>{c.aiFitTier}</span>
                    )}
                    {c.rationale && (
                      <p className="text-xs text-slate-500 mt-0.5 italic">"{c.rationale}"</p>
                    )}
                  </div>
                  {(shortlist.status === 'ADMIN_REVIEW' || shortlist.status === 'CLIENT_VISIBLE' || shortlist.status === 'UPDATED') && (
                    <form action={createAndSendInvitationAction.bind(null, c.id, shortlist.projectId, c.consultantId, shortlist.id)}>
                      <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Invite</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('ADMIN_REVIEW') && (
            <form action={submitForAdminReviewAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit for Admin Review</button>
            </form>
          )}
          {allowed.includes('CLIENT_VISIBLE') && (
            <form action={makeClientVisibleAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Make Client Visible</button>
            </form>
          )}
          {allowed.includes('CLOSED') && (
            <form action={closeShortlistAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Close</button>
            </form>
          )}
          {(shortlist.status === 'ADMIN_REVIEW' || shortlist.status === 'CLIENT_VISIBLE') && (
            <form action={generateMatchRationaleAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-purple-600 text-white hover:bg-purple-700">Generate Match Rationale</button>
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
