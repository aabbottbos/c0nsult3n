import { db } from '@/lib/db'

export default async function ConsultantsPage() {
  const profiles = await db.consultantProfile.findMany({
    include: {
      user: { select: { email: true } },
      verification: { select: { identityStatus: true } },
      payoutSetup: { select: { status: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Consultants</h1>
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Approval</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Account</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Published</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Verification</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Payout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {profiles.map(p => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <a href={`/consultants/${p.id}`} className="text-indigo-600 hover:underline">{p.user.email}</a>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.approvalStatus}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.accountStatus}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.publicationStatus}</span>
                </td>
                <td className="px-4 py-3 text-slate-400">{p.verification?.identityStatus ?? '—'}</td>
                <td className="px-4 py-3 text-slate-400">{p.payoutSetup?.status ?? '—'}</td>
              </tr>
            ))}
            {profiles.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No consultant profiles yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
