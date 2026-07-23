import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

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

  const statusColors: Record<string, string> = {
    PENDING_START: 'bg-slate-100 text-slate-600',
    IN_PROGRESS: 'bg-green-100 text-green-700',
    DELIVERABLE_SUBMITTED: 'bg-blue-100 text-blue-700',
    UNDER_REVIEW: 'bg-yellow-100 text-yellow-700',
    REVISION_REQUESTED: 'bg-orange-100 text-orange-700',
    DISPUTED: 'bg-red-100 text-red-700',
    ACCEPTED: 'bg-green-100 text-green-700',
  }

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Active Engagements</h1>
      <div className="space-y-3">
        {engagements.map(e => (
          <a
            key={e.id}
            href={`/engagements/${e.id}`}
            className="block bg-white rounded-lg border border-l-4 border-l-green-500 border-slate-200 p-5 hover:border-indigo-300 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="font-medium text-slate-900">{e.project.title}</div>
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[e.status] ?? 'bg-slate-100 text-slate-600'}`}>{e.status}</span>
            </div>
            <div className="text-sm text-slate-500 mt-1">${e.scope.fee.toString()} · Due {e.scope.dueDate.toLocaleDateString()}</div>
          </a>
        ))}
        {engagements.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No active engagements.</div>
        )}
      </div>
    </div>
  )
}
