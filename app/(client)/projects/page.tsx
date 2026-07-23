import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

const ACTION_LABELS: Partial<Record<string, string>> = {
  SCOPE_APPROVED: 'Scope ready for review →',
  SHORTLIST_READY: 'Shortlist ready — select a consultant →',
  UNDER_REVIEW: 'Deliverable submitted — review now →',
}

export default async function ClientProjectsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })
  const projects = await db.project.findMany({
    where: { clientId: contact.organizationId },
    orderBy: { createdAt: 'desc' },
  })

  const needsAction = (status: string) => status in ACTION_LABELS

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">My Projects</h1>
      <div className="space-y-3">
        {projects.map(p => (
          <a
            key={p.id}
            href={`/projects/${p.id}`}
            className={`block bg-white rounded-lg border p-5 hover:border-indigo-300 transition-colors ${needsAction(p.status) ? 'border-l-4 border-l-indigo-500 border-slate-200' : 'border-slate-200'}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-900">{p.title}</span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{p.status}</span>
            </div>
            {ACTION_LABELS[p.status] && (
              <p className="text-sm text-indigo-600 mt-1">{ACTION_LABELS[p.status]}</p>
            )}
          </a>
        ))}
        {projects.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">
            No projects yet. <a href="/projects/new" className="text-indigo-600 hover:underline">Start one →</a>
          </div>
        )}
      </div>
    </div>
  )
}
