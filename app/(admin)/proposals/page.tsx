import { listProposals } from '@/modules/proposals/service'

export default async function ProposalsPage() {
  const proposals = await listProposals()
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Proposals</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">ID</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Fit statement</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {proposals.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/admin/proposals/${p.id}`} className="text-indigo-600 hover:underline font-mono text-xs">{p.id.slice(0, 12)}…</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.status}</span>
                </td>
                <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{p.fitStatement}</td>
                <td className="px-4 py-3 text-sm text-slate-500">{p.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {proposals.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No proposals yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
