import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ReactNode } from 'react'

export default async function ConsultantLayout({ children }: { children: ReactNode }) {
  await requireRole('consultant')
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const pendingInvitations = await db.consultantInvitation.count({
    where: {
      consultantId: profile.id,
      status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] },
    },
  })

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-slate-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-white text-sm tracking-tight border-b border-slate-700">
          Consulten
        </div>
        <nav className="flex-1 px-2 py-3 text-sm space-y-0.5">
          <a href="/invitations" className="flex items-center justify-between px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">
            <span>Invitations</span>
            {pendingInvitations > 0 && (
              <span className="bg-indigo-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{pendingInvitations}</span>
            )}
          </a>
          <a href="/engagements" className="flex items-center px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Active Engagements</a>
        </nav>
        <div className="px-3 py-4 border-t border-slate-700">
          <a href="/sign-out" className="text-xs text-slate-500 hover:text-slate-300">Sign out</a>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
