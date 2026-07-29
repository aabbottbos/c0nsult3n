import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

const statusBadge: Record<string, string> = {
  PENDING_START:          'bg-ink-100 text-ink-600',
  IN_PROGRESS:            'bg-teal-50 text-teal-700',
  DELIVERABLE_SUBMITTED:  'bg-brand-50 text-brand-700',
  UNDER_REVIEW:           'bg-amber-50 text-amber-700',
  REVISION_REQUESTED:     'bg-amber-50 text-amber-700',
  DISPUTED:               'bg-red-50 text-red-700',
  ACCEPTED:               'bg-teal-50 text-teal-700',
}

export default async function ConsultantEngagementsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const engagements = await db.engagement.findMany({
    where: {
      consultantId: profile.id,
      status: { notIn: ['CLOSED', 'CANCELLED'] },
    },
    include: { project: true, scope: true },
    orderBy: { createdAt: 'desc' },
  })

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-display font-semibold text-ink-900">Active Engagements</h1>
      <div className="space-y-3">
        {engagements.map(e => (
          <a
            key={e.id}
            href={`/engagements/${e.id}`}
            className="block bg-white rounded-lg border border-ink-100 border-l-4 border-l-teal-600 shadow-sm p-5 hover:border-brand-300 hover:shadow-md transition-colors duration-150"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-ink-900">{e.project.title}</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[e.status] ?? 'bg-ink-100 text-ink-600'}`}>{humanStatus(e.status)}</span>
            </div>
            <div className="text-sm text-ink-400 mt-1">
              <span className="font-mono">${e.scope.fee.toString()}</span>
              {' · Due '}
              {e.scope.dueDate.toLocaleDateString()}
            </div>
          </a>
        ))}
        {engagements.length === 0 && (
          <div className="bg-white rounded-lg border border-ink-100 p-8 text-center text-sm text-ink-400">No active engagements.</div>
        )}
      </div>
    </div>
  )
}
