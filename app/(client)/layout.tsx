import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { countUnread } from '@/modules/notifications/service'
import { SignOutButton } from '@/components/sign-out-button'
import type { ReactNode } from 'react'

export default async function ClientLayout({ children }: { children: ReactNode }) {
  await requireRole('client')
  const { userId } = await auth()
  const user = userId ? await db.user.findUnique({ where: { clerkId: userId } }) : null

  // User row not yet created (webhook lag on first sign-in) — render shell without DB data
  const unreadCount = user ? await countUnread(user.id) : 0
  const projects = user ? await db.project.findMany({
    where: { client: { contacts: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true },
  }) : []

  const needsAction = (status: string) =>
    ['SCOPE_APPROVED', 'SHORTLIST_READY', 'UNDER_REVIEW'].includes(status)

  return (
    <div className="flex min-h-screen bg-surface-subtle">
      <aside className="w-56 bg-brand-900 text-ink-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-semibold text-white text-sm tracking-tight border-b border-brand-800 font-display">
          Consulten
        </div>
        <div className="px-3 py-3">
          <a
            href="/projects/new"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded-pill text-sm font-medium bg-brand-600 text-white hover:opacity-90 transition-opacity mb-4"
          >
            + New Project
          </a>
          <p className="px-1 pb-1 text-xs font-semibold text-ink-400 uppercase tracking-widest">My Projects</p>
          <nav className="space-y-0.5">
            {projects.map(p => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-2 py-1.5 rounded text-sm text-ink-300 hover:bg-brand-800 hover:text-white transition-colors"
              >
                <span className="truncate">{p.title}</span>
                {needsAction(p.status) && (
                  <span className="ml-1 flex-shrink-0 w-2 h-2 rounded-full bg-brand-400" />
                )}
              </a>
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-1 text-xs text-ink-400">No projects yet.</p>
            )}
          </nav>
        </div>
        <div className="px-3 pb-2">
          <a href="/notifications" className="flex items-center justify-between px-2 py-1.5 rounded text-sm text-ink-300 hover:bg-brand-800 hover:text-white transition-colors">
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="bg-brand-500 text-white text-xs rounded-full px-1.5 py-0.5 font-semibold">{unreadCount}</span>
            )}
          </a>
        </div>
        <div className="mt-auto px-3 py-4 border-t border-brand-800">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
