import { notFound } from 'next/navigation'
import { getDispute } from '@/modules/disputes/service'
import { generateAiDisputeSummaryAction, resolveDisputeAction } from '../actions'

export default async function DisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const dispute = await getDispute(id)
  if (!dispute) notFound()

  const isClosed = dispute.adminReviewStatus === 'CLOSED'
  const engagement = dispute.engagement
  const latestDeliverable = engagement.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <a href="/admin/disputes" className="text-sm text-indigo-600 hover:underline">← Disputes</a>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Dispute — {engagement.project.title}</h1>
          <p className="text-sm text-slate-500 mt-0.5">Engagement: <a href={`/admin/engagements/${engagement.id}`} className="text-indigo-600 hover:underline">{engagement.id}</a></p>
        </div>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{dispute.adminReviewStatus}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3 text-sm">
        <h2 className="font-semibold text-slate-700">Dispute Reason</h2>
        <p className="text-slate-700">{dispute.disputeReason}</p>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3 text-sm">
          <h2 className="font-semibold text-slate-700">Latest Deliverable</h2>
          {latestDeliverable.consultantNotes && (
            <div className="p-3 bg-slate-50 rounded">
              <p className="text-xs font-medium text-slate-500 mb-1">Consultant notes</p>
              <p>{latestDeliverable.consultantNotes}</p>
            </div>
          )}
          {latestDeliverable.aiQaNotes && (
            <div className="p-3 bg-blue-50 rounded">
              <p className="text-xs font-medium text-blue-600 mb-1">AI QA Notes</p>
              <p>{latestDeliverable.aiQaNotes}</p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Communications</h2>
        {engagement.communications.length === 0 ? (
          <p className="text-sm text-slate-400">No messages.</p>
        ) : (
          <ul className="space-y-3">
            {engagement.communications.map(m => (
              <li key={m.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{m.messageType}</span>
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs">{m.createdAt.toLocaleString()}</span>
                </div>
                <p className="text-slate-600 mt-0.5">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">AI Dispute Summary</h2>
          {!isClosed && (
            <form action={generateAiDisputeSummaryAction.bind(null, id, engagement.id)}>
              <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Summarize Dispute</button>
            </form>
          )}
        </div>
        {dispute.aiDisputeSummary ? (
          <div className="p-3 bg-slate-50 rounded text-sm text-slate-700">{dispute.aiDisputeSummary}</div>
        ) : (
          <p className="text-sm text-slate-400">No AI summary yet. Click "Summarize Dispute" to generate one.</p>
        )}
      </div>

      {!isClosed && (
        <div className="bg-white rounded-lg border border-red-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Resolve Dispute</h2>
          <form action={resolveDisputeAction.bind(null, id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Proposed resolution</label>
              <textarea name="proposedResolution" required rows={3} className="w-full text-sm border border-slate-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Outcome</label>
              <select name="outcome" required className="text-sm border border-slate-300 rounded px-3 py-2">
                <option value="ACCEPTED">Accept deliverable</option>
                <option value="REVISION_REQUESTED">Request revision</option>
                <option value="CANCELLED">Cancel engagement</option>
              </select>
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Resolve Dispute</button>
          </form>
        </div>
      )}

      {isClosed && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 text-sm text-green-700">
          Dispute closed. Outcome: <span className="font-medium">{dispute.resultingStatus}</span>.
          <p className="mt-1 text-green-600">{dispute.finalResolution}</p>
        </div>
      )}
    </div>
  )
}
