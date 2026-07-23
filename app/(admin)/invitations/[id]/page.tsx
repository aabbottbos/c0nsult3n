import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { sendInvitationAction, acceptInterestAction, declineInvitationAction, expireInvitationAction } from '../actions'
import { INVITATION_TRANSITIONS } from '@/modules/invitations/types'

export default async function InvitationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const inv = await db.consultantInvitation.findUnique({ where: { id } })
  if (!inv) notFound()

  const project = await db.project.findUnique({ where: { id: inv.projectId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })
  const allowed = INVITATION_TRANSITIONS[inv.status]

  return (
    <div className="p-8 space-y-6">
      <a href="/invitations" className="text-sm text-indigo-600 hover:underline">← Invitations</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Invitation</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{inv.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Project</dt><dd><a href={`/projects/${inv.projectId}`} className="text-indigo-600 hover:underline">{project?.title ?? inv.projectId}</a></dd></div>
          <div><dt className="text-slate-500">Consultant</dt><dd><a href={`/consultants/${inv.consultantId}`} className="text-indigo-600 hover:underline">{inv.consultantId.slice(0, 12)}…</a></dd></div>
          <div><dt className="text-slate-500">Sent</dt><dd className="text-slate-900">{inv.sentAt?.toLocaleDateString() ?? '—'}</dd></div>
          <div><dt className="text-slate-500">Expires</dt><dd className="text-slate-900">{inv.expiresAt?.toLocaleDateString() ?? '—'}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {allowed.includes('SENT') && (
            <form action={sendInvitationAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Send</button>
            </form>
          )}
          {allowed.includes('ACCEPTED_INTEREST') && (
            <form action={acceptInterestAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Interest</button>
            </form>
          )}
          {allowed.includes('DECLINED') && (
            <form action={declineInvitationAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Decline</button>
            </form>
          )}
          {allowed.includes('EXPIRED') && (
            <form action={expireInvitationAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Expire</button>
            </form>
          )}
          {allowed.length === 0 && <p className="text-sm text-slate-400">No actions available.</p>}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Event Log</h2>
        {events.length === 0 ? <p className="text-sm text-slate-400">No events.</p> : (
          <ul className="space-y-2">
            {events.map(e => (
              <li key={e.id} className="text-xs text-slate-600">
                <span className="font-medium">{e.action}</span> by {e.actorRole} · {e.timestamp.toISOString()}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
