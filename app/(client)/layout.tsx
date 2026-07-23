import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ReactNode } from 'react'

export default async function ClientLayout({ children }: { children: ReactNode }) {
  await requireRole('client')
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const projects = await db.project.findMany({
    where: { client: { contacts: { some: { userId: user.id } } } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, status: true },
  })

  const needsAction = (status: string) =>
    ['SCOPE_APPROVED', 'SHORTLIST_READY', 'UNDER_REVIEW'].includes(status)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-slate-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-white text-sm tracking-tight border-b border-slate-700">
          Consulten
        </div>
        <div className="px-3 py-3">
          <a
            href="/projects/new"
            className="flex items-center justify-center gap-1 px-3 py-2 rounded text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 mb-4"
          >
            + New Project
          </a>
          <p className="px-1 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">My Projects</p>
          <nav className="space-y-0.5">
            {projects.map(p => (
              <a
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-2 py-1.5 rounded text-sm text-slate-300 hover:bg-slate-700"
              >
                <span className="truncate">{p.title}</span>
                {needsAction(p.status) && (
                  <span className="ml-1 flex-shrink-0 w-2 h-2 rounded-full bg-indigo-400" />
                )}
              </a>
            ))}
            {projects.length === 0 && (
              <p className="px-2 py-1 text-xs text-slate-500">No projects yet.</p>
            )}
          </nav>
        </div>
        <div className="mt-auto px-3 py-4 border-t border-slate-700">
          <a href="/sign-out" className="text-xs text-slate-500 hover:text-slate-300">Sign out</a>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
