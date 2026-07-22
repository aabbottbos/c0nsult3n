import { listOrganizations } from '@/modules/clients/service'

export default async function ClientsPage() {
  const orgs = await listOrganizations()
  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Client Organizations</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map(org => (
              <tr key={org.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-sm">
                  <a href={`/admin/clients/${org.id}`} className="text-indigo-600 hover:underline font-medium">{org.name}</a>
                </td>
                <td className="px-4 py-3 text-sm text-slate-500">{org.createdAt.toLocaleDateString()}</td>
              </tr>
            ))}
            {orgs.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">No client organizations yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
