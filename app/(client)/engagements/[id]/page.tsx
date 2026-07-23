import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { acceptDeliverableAction, requestRevisionAction } from '../../projects/actions'

export default async function ClientEngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id, clientId: contact.organizationId },
    include: {
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
      project: true,
    },
  })
  if (!engagement) notFound()

  const latestDeliverable = engagement.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6">
      <a href={`/projects/${engagement.projectId}`} className="text-sm text-indigo-600 hover:underline">← {engagement.project.title}</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Engagement</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {latestDeliverable && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Deliverable</h2>
          <div className="text-sm text-slate-600">
            Submitted {latestDeliverable.submittedAt?.toLocaleDateString() ?? '—'}
            {latestDeliverable.fileUrl && (
              <div className="mt-2"><a href={latestDeliverable.fileUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline break-all">{latestDeliverable.fileUrl}</a></div>
            )}
          </div>
          {engagement.status === 'UNDER_REVIEW' && (
            <div className="flex gap-3">
              <form action={acceptDeliverableAction.bind(null, engagement.id, engagement.projectId)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Deliverable</button>
              </form>
              <form action={requestRevisionAction.bind(null, engagement.id, latestDeliverable.id, 'Revision requested by client', engagement.projectId)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Request Revision</button>
              </form>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Messages</h2>
        {engagement.communications.length === 0
          ? <p className="text-sm text-slate-400">No messages yet.</p>
          : (
            <ul className="space-y-3">
              {engagement.communications.map(m => (
                <li key={m.id} className="text-sm">
                  <span className="font-medium text-slate-700 capitalize">{m.senderRole}</span>
                  <span className="text-slate-400 text-xs ml-2">{m.createdAt.toLocaleString()}</span>
                  <p className="text-slate-600 mt-0.5">{m.body}</p>
                </li>
              ))}
            </ul>
          )
        }
      </div>
    </div>
  )
}
