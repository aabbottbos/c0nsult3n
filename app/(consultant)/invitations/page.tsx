import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

function daysUntil(date: Date | null): number | null {
  if (!date) return null
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}

function urgencyClass(days: number | null) {
  if (days === null) return 'text-slate-400'
  if (days < 5) return 'text-red-600 font-semibold'
  if (days < 10) return 'text-amber-600 font-semibold'
  return 'text-slate-500'
}

export default async function ConsultantInvitationsPage() {
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const invitations = await db.consultantInvitation.findMany({
    where: {
      consultantId: profile.id,
      status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] },
    },
    include: { project: { include: { scope: true } } },
    orderBy: { sentAt: 'asc' },
  })

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Invitations</h1>
      <div className="space-y-3">
        {invitations.map(inv => {
          const days = daysUntil(inv.expiresAt)
          return (
            <div key={inv.id} className="bg-white rounded-lg border border-l-4 border-l-indigo-500 border-slate-200 p-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-slate-900">{inv.project.title}</div>
                  {inv.project.scope && (
                    <div className="text-sm text-slate-500 mt-1">
                      ${inv.project.scope.fee.toString()} · {inv.project.scope.effortCapHours}h cap · Due {inv.project.scope.dueDate.toLocaleDateString()}
                    </div>
                  )}
                </div>
                {days !== null && (
                  <span className={`text-xs ${urgencyClass(days)}`}>{days} day{days !== 1 ? 's' : ''} left</span>
                )}
              </div>
              <a href={`/invitations/${inv.id}`} className="inline-block px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
                View & Respond
              </a>
            </div>
          )
        })}
        {invitations.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No pending invitations.</div>
        )}
      </div>
    </div>
  )
}
