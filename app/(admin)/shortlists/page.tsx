import { db } from '@/lib/db'

export default async function ShortlistsPage() {
  const shortlists = await db.shortlist.findMany({
    orderBy: { createdAt: 'desc' },
    include: { project: true, candidates: true },
  })
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Shortlists</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Project</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Candidates</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shortlists.map(sl => (
              <tr key={sl.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/shortlists/${sl.id}`} className="text-indigo-600 hover:underline font-medium">{sl.project.title}</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{sl.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600">{sl.candidates.length}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{sl.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {shortlists.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No shortlists yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
