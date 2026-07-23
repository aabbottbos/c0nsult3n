import { db } from '@/lib/db'

export default async function ScopesPage() {
  const scopes = await db.scope.findMany({
    orderBy: { createdAt: 'desc' },
    include: { project: true },
  })
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Scopes</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Deliverable</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fee</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {scopes.map(s => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/scopes/${s.id}`} className="text-indigo-600 hover:underline font-medium">{s.deliverable}</a>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">
                  <a href={`/projects/${s.project.id}`} className="text-indigo-600 hover:underline">{s.project.title}</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{s.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">${s.fee.toString()} / {s.effortCapHours}h</td>
              </tr>
            ))}
            {scopes.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No scopes yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
