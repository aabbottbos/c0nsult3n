import { notFound } from 'next/navigation'
import { getProfile } from '@/modules/consultants/service'
import { db } from '@/lib/db'
import { approveProfileAction, publishProfileAction, suspendProfileAction } from '../actions'

export default async function ConsultantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })

  return (
    <div className="p-8 space-y-6">
      <a href="/admin/consultants" className="text-sm text-indigo-600 hover:underline">← Consultants</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Consultant Profile</h1>
        <div className="flex gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.approvalStatus}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.accountStatus}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.publicationStatus}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">User ID</dt><dd className="text-slate-900 font-mono text-xs">{profile.userId}</dd></div>
          <div><dt className="text-slate-500">Created</dt><dd className="text-slate-900">{profile.createdAt.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {profile.approvalStatus === 'pending' && (
            <form action={approveProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Approve</button>
            </form>
          )}
          {profile.approvalStatus === 'approved' && profile.accountStatus === 'active' && profile.publicationStatus !== 'published' && (
            <form action={publishProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Publish</button>
            </form>
          )}
          {profile.accountStatus === 'active' && (
            <form action={suspendProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Suspend</button>
            </form>
          )}
          {profile.approvalStatus !== 'pending' && profile.publicationStatus === 'published' && profile.accountStatus !== 'active' && (
            <p className="text-sm text-slate-400">No actions available.</p>
          )}
        </div>
      </div>

      {profile.restrictions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Restrictions</h2>
          <ul className="space-y-2">
            {profile.restrictions.map(r => (
              <li key={r.id} className="text-sm text-slate-700">{r.type} {r.notes && `— ${r.notes}`}</li>
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
