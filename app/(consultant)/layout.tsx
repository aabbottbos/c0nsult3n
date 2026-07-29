import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { countUnread } from '@/modules/notifications/service'
import { SignOutButton } from '@/components/sign-out-button'
import type { ReactNode } from 'react'

export default async function ConsultantLayout({ children }: { children: ReactNode }) {
  await requireRole('consultant')
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const unreadCount = await countUnread(user.id)
  const pendingInvitations = await db.consultantInvitation.count({
    where: {
      consultantId: profile.id,
      status: { in: ['SENT', 'VIEWED', 'QUESTIONS_ASKED'] },
    },
  })

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      <aside className="w-56 bg-brand-900 text-ink-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-semibold text-white text-sm tracking-tight border-b border-brand-800 font-display">
          Consulten
        </div>
        <nav className="flex-1 px-2 py-3 text-sm space-y-0.5">
          <a href="/invitations" className="flex items-center justify-between px-3 py-1.5 rounded text-ink-300 hover:bg-brand-800 hover:text-white transition-colors">
            <span>Invitations</span>
            {pendingInvitations > 0 && (
              <span className="bg-brand-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{pendingInvitations}</span>
            )}
          </a>
          <a href="/engagements" className="flex items-center px-3 py-1.5 rounded text-ink-300 hover:bg-brand-800 hover:text-white transition-colors">Active Engagements</a>
          <a href="/consultant/notifications" className="flex items-center justify-between px-3 py-1.5 rounded text-ink-300 hover:bg-brand-800 hover:text-white transition-colors">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-brand-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{unreadCount}</span>
            )}
          </a>
        </nav>
        <div className="px-3 py-4 border-t border-brand-800">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
