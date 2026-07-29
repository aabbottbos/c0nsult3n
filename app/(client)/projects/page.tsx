import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const ACTION_LABELS: Partial<Record<string, string>> = {
  SCOPE_APPROVED: 'Scope ready for review →',
  SHORTLIST_READY: 'Shortlist ready — select a consultant →',
  UNDER_REVIEW: 'Deliverable submitted — review now →',
}

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

export default async function ClientProjectsPage() {
  const { userId } = await auth()
  const user = userId ? await db.user.findUnique({ where: { clerkId: userId } }) : null
  const contact = user ? await db.clientContact.findUnique({ where: { userId: user.id } }) : null
  const projects = contact ? await db.project.findMany({
    where: { clientId: contact.organizationId },
    orderBy: { createdAt: 'desc' },
  }) : []

  const needsAction = (status: string) => status in ACTION_LABELS

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-display font-semibold text-ink-900">My Projects</h1>
      <div className="space-y-3">
        {projects.map(p => (
          <a
            key={p.id}
            href={`/projects/${p.id}`}
            className={`block bg-white border rounded-lg shadow-sm p-5 hover:border-brand-300 hover:shadow-md transition-colors duration-150 ${needsAction(p.status) ? 'border-l-4 border-l-brand-500 border-ink-100' : 'border-ink-100'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-ink-900">{p.title}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-600">{humanStatus(p.status)}</span>
            </div>
            {ACTION_LABELS[p.status] && (
              <p className="text-sm text-brand-600 mt-1">{ACTION_LABELS[p.status]}</p>
            )}
          </a>
        ))}
        {projects.length === 0 && (
          <div className="bg-white rounded-lg border border-ink-100 p-8 text-center text-sm text-ink-400">
            No projects yet. <a href="/projects/new" className="text-brand-600 hover:text-brand-700">Start one →</a>
          </div>
        )}
      </div>
    </div>
  )
}
