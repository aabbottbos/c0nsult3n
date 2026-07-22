import { db } from '@/lib/db'

export default async function DeliverablesPage() {
  const deliverables = await db.deliverable.findMany({
    orderBy: { submittedAt: 'desc' },
    include: { engagement: true },
  })
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Deliverables</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Engagement</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Submitted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deliverables.map(d => (
              <tr key={d.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/admin/deliverables/${d.id}`} className="text-indigo-600 hover:underline font-mono text-xs">{d.id.slice(0, 12)}…</a>
                </td>
                <td className="px-4 py-3 text-sm">
                  <a href={`/admin/engagements/${d.engagementId}`} className="text-indigo-600 hover:underline">{d.engagementId.slice(0, 12)}…</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{d.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{d.submittedAt?.toLocaleDateString() ?? '—'}</td>
              </tr>
            ))}
            {deliverables.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No deliverables yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
