import { notFound } from 'next/navigation'
import { db } from '@/lib/db'

export default async function DeliverableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const deliverable = await db.deliverable.findUnique({ where: { id }, include: { engagement: true } })
  if (!deliverable) notFound()

  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })

  return (
    <div className="p-8 space-y-6">
      <a href="/deliverables" className="text-sm text-indigo-600 hover:underline">← Deliverables</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Deliverable</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{deliverable.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Engagement</dt><dd><a href={`/engagements/${deliverable.engagementId}`} className="text-indigo-600 hover:underline">{deliverable.engagementId.slice(0, 12)}…</a></dd></div>
          <div><dt className="text-slate-500">Submitted</dt><dd className="text-slate-900">{deliverable.submittedAt?.toLocaleDateString() ?? '—'}</dd></div>
          {deliverable.fileUrl && <div className="col-span-2"><dt className="text-slate-500">File</dt><dd><a href={deliverable.fileUrl} className="text-indigo-600 hover:underline break-all">{deliverable.fileUrl}</a></dd></div>}
        </dl>
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
