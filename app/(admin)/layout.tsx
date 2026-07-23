import { requireRole } from '@/lib/auth'
import { SignOutButton } from '@/components/sign-out-button'
import type { ReactNode } from 'react'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole('admin')
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="w-56 bg-slate-800 text-slate-300 flex flex-col flex-shrink-0">
        <div className="px-4 py-5 font-bold text-white text-sm tracking-tight border-b border-slate-700">
          Consulten <span className="text-indigo-400">Admin</span>
        </div>
        <nav className="flex-1 px-2 py-2 text-sm space-y-0.5">
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">Projects</p>
          <a href="/admin/projects" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Projects</a>
          <a href="/scopes" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Scopes</a>
          <a href="/shortlists" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Shortlists</a>
          <a href="/admin/invitations" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Invitations</a>
          <a href="/proposals" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Proposals</a>
          <a href="/admin/engagements" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Engagements</a>
          <a href="/deliverables" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Deliverables</a>
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">People</p>
          <a href="/clients" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Clients</a>
          <a href="/consultants" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Consultants</a>
          <p className="px-3 pt-3 pb-1 text-xs font-semibold text-slate-500 uppercase tracking-widest">System</p>
          <a href="/events" className="flex items-center gap-2 px-3 py-1.5 rounded text-slate-300 hover:bg-slate-700">Event Log</a>
        </nav>
        <div className="px-3 py-4 border-t border-slate-700">
          <SignOutButton />
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
