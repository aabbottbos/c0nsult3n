import { notFound } from 'next/navigation'
import { getProposal } from '@/modules/proposals/service'
import { db } from '@/lib/db'
import { selectProposalAction } from '../actions'

export default async function ProposalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const proposal = await getProposal(id)
  if (!proposal) notFound()

  const invitation = await db.consultantInvitation.findUnique({ where: { id: proposal.invitationId } })
  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })

  return (
    <div className="p-8 space-y-6">
      <a href="/proposals" className="text-sm text-indigo-600 hover:underline">← Proposals</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Proposal</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{proposal.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">Invitation</dt><dd><a href={`/invitations/${proposal.invitationId}`} className="text-indigo-600 hover:underline">{proposal.invitationId.slice(0, 12)}…</a></dd></div>
          {invitation && <div><dt className="text-slate-500">Project</dt><dd><a href={`/projects/${invitation.projectId}`} className="text-indigo-600 hover:underline">{invitation.projectId.slice(0, 12)}…</a></dd></div>}
          <div className="col-span-2"><dt className="text-slate-500 mb-1">Fit statement</dt><dd className="text-slate-900">{proposal.fitStatement}</dd></div>
        </dl>
      </div>

      {proposal.status === 'SUBMITTED' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
          <form action={selectProposalAction.bind(null, id)}>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Select Proposal</button>
          </form>
        </div>
      )}

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
