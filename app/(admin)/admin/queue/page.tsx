import { db } from '@/lib/db'

export default async function AdminQueuePage() {
  const [
    projectsPendingReview,
    scopesPendingReview,
    shortlistsPendingReview,
    proposalsPendingReview,
    openAdminTasks,
    openDisputes,
  ] = await Promise.all([
    db.project.findMany({
      where: { status: 'SUBMITTED' },
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.scope.findMany({
      where: { status: 'ADMIN_REVIEW' },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.shortlist.findMany({
      where: { status: 'ADMIN_REVIEW' },
      include: { project: { select: { title: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.proposal.findMany({
      where: { status: 'PENDING_ADMIN_REVIEW' },
      include: { invitation: { include: { project: { select: { title: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
    db.adminTask.findMany({
      where: { resolved: false },
      orderBy: { createdAt: 'asc' },
    }),
    db.dispute.findMany({
      where: { adminReviewStatus: { in: ['OPENED', 'UNDER_ADMIN_REVIEW', 'PROPOSED_RESOLUTION'] } },
      include: { engagement: { include: { project: { select: { title: true } } } } },
      orderBy: { createdAt: 'asc' },
    }),
  ])

  const totalItems =
    projectsPendingReview.length +
    scopesPendingReview.length +
    shortlistsPendingReview.length +
    proposalsPendingReview.length +
    openAdminTasks.length +
    openDisputes.length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold text-slate-900">Admin Queue</h1>
        {totalItems > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {totalItems === 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
          No items need attention.
        </div>
      )}

      {projectsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Projects — Awaiting Admin Review ({projectsPendingReview.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {projectsPendingReview.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/admin/projects/${p.id}`} className="font-medium text-indigo-600 hover:underline">{p.title}</a>
                  <span className="text-slate-400 ml-2">· {p.client.name}</span>
                </div>
                <span className="text-xs text-slate-400">{p.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {scopesPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Scopes — Awaiting Approval ({scopesPendingReview.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {scopesPendingReview.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/scopes/${s.id}`} className="font-medium text-indigo-600 hover:underline">{s.deliverable}</a>
                  <span className="text-slate-400 ml-2">· {s.project.title}</span>
                </div>
                <span className="text-xs text-slate-400">{s.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {shortlistsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Shortlists — Awaiting Approval ({shortlistsPendingReview.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {shortlistsPendingReview.map(s => (
              <li key={s.id} className="py-2 flex items-center justify-between text-sm">
                <a href={`/shortlists/${s.id}`} className="font-medium text-indigo-600 hover:underline">{s.project.title}</a>
                <span className="text-xs text-slate-400">{s.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {proposalsPendingReview.length > 0 && (
        <section className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Proposals — Deviations Pending Review ({proposalsPendingReview.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {proposalsPendingReview.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <a href={`/proposals/${p.id}`} className="font-medium text-indigo-600 hover:underline">
                  {p.invitation.project.title}
                </a>
                <span className="text-xs text-slate-400">{p.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openAdminTasks.length > 0 && (
        <section className="bg-white rounded-lg border border-amber-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Admin Tasks — Unresolved ({openAdminTasks.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {openAdminTasks.map(t => (
              <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <span className="text-slate-700">{t.reason}</span>
                  {t.engagementId && (
                    <a href={`/admin/engagements/${t.engagementId}`} className="text-indigo-600 hover:underline ml-2">
                      View engagement →
                    </a>
                  )}
                </div>
                <span className="text-xs text-slate-400">{t.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {openDisputes.length > 0 && (
        <section className="bg-white rounded-lg border border-red-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Open Disputes ({openDisputes.length})
          </h2>
          <ul className="divide-y divide-slate-100">
            {openDisputes.map(d => (
              <li key={d.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <a href={`/admin/disputes/${d.id}`} className="font-medium text-indigo-600 hover:underline">
                    {d.engagement.project.title}
                  </a>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 ml-2">
                    {d.adminReviewStatus}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{d.createdAt.toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
