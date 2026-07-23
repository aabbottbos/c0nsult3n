import { db } from '@/lib/db'

export default async function DashboardPage() {
  const [projects, scopes, shortlists, invitations, proposals, engagements, clients, consultants] = await Promise.all([
    db.project.count(),
    db.scope.count(),
    db.shortlist.count(),
    db.consultantInvitation.count(),
    db.proposal.count(),
    db.engagement.count(),
    db.clientOrganization.count(),
    db.consultantProfile.count(),
  ])

  const stats = [
    { label: 'Projects', count: projects, href: '/projects' },
    { label: 'Scopes', count: scopes, href: '/scopes' },
    { label: 'Shortlists', count: shortlists, href: '/shortlists' },
    { label: 'Invitations', count: invitations, href: '/invitations' },
    { label: 'Proposals', count: proposals, href: '/proposals' },
    { label: 'Engagements', count: engagements, href: '/engagements' },
    { label: 'Clients', count: clients, href: '/clients' },
    { label: 'Consultants', count: consultants, href: '/consultants' },
  ]

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
      <div className="grid grid-cols-4 gap-4">
        {stats.map(s => (
          <a key={s.label} href={s.href} className="bg-white rounded-lg border border-slate-200 p-5 hover:border-indigo-300 transition-colors">
            <div className="text-3xl font-bold text-slate-900">{s.count}</div>
            <div className="text-sm text-slate-500 mt-1">{s.label}</div>
          </a>
        ))}
      </div>
    </div>
  )
}
