import { listEngagements } from '@/modules/engagements/service'

export default async function EngagementsPage() {
  const engagements = await listEngagements()
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Engagements</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {engagements.map(e => (
              <tr key={e.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/engagements/${e.id}`} className="text-indigo-600 hover:underline font-mono text-xs">{e.id.slice(0, 12)}…</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{e.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{e.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {engagements.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No engagements yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
