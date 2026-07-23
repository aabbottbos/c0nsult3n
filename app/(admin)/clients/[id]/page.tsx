import { notFound } from 'next/navigation'
import { getOrganization } from '@/modules/clients/service'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const org = await getOrganization(id)
  if (!org) notFound()

  return (
    <div className="p-8 space-y-6">
      <a href="/clients" className="text-sm text-indigo-600 hover:underline">← Clients</a>
      <h1 className="text-xl font-semibold text-slate-900">{org.name}</h1>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Contacts</h2>
        {org.contacts.length === 0 ? <p className="text-sm text-slate-400">No contacts.</p> : (
          <ul className="space-y-2">
            {org.contacts.map(c => (
              <li key={c.id} className="text-sm text-slate-700">{c.name} — <span className="text-slate-500">{c.email}</span></li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Projects</h2>
        {org.projects.length === 0 ? <p className="text-sm text-slate-400">No projects.</p> : (
          <ul className="space-y-2">
            {org.projects.map(p => (
              <li key={p.id} className="text-sm">
                <a href={`/projects/${p.id}`} className="text-indigo-600 hover:underline">{p.title}</a>
                <span className="ml-2 text-slate-500 text-xs">{p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
