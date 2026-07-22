import { db } from '@/lib/db'

export default async function EventsPage() {
  const events = await db.eventLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 200,
  })
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Event Log</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Timestamp</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Entity</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Actor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {events.map(e => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500 font-mono">{e.timestamp.toISOString()}</td>
                <td className="px-4 py-3 text-xs text-slate-700">
                  <span className="font-medium">{e.entityType}</span>
                  <span className="text-slate-400 ml-1">{e.entityId.slice(0, 8)}…</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-900">{e.action}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{e.actorRole}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No events yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
