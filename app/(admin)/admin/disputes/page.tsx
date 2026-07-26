import { listDisputes } from '@/modules/disputes/service'

export default async function DisputesListPage() {
  const disputes = await listDisputes()

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Open Disputes</h1>
      {disputes.length === 0 ? (
        <p className="text-sm text-slate-400">No open disputes.</p>
      ) : (
        <ul className="space-y-3">
          {disputes.map(d => (
            <li key={d.id} className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">{d.engagement.project.title}</p>
                <p className="text-xs text-slate-500">{d.disputeReason}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{d.adminReviewStatus}</span>
                <a href={`/admin/disputes/${d.id}`} className="text-sm text-indigo-600 hover:underline">View →</a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
