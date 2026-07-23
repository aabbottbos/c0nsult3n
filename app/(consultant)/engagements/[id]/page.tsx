import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitDeliverableAction } from '../actions'

export default async function ConsultantEngagementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const engagement = await db.engagement.findUnique({
    where: { id, consultantId: profile.id },
    include: {
      project: true,
      scope: true,
      deliverables: { orderBy: { createdAt: 'desc' } },
      communications: { orderBy: { createdAt: 'asc' } },
    },
  })
  if (!engagement) notFound()

  const canSubmit = engagement.status === 'IN_PROGRESS'

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <a href="/engagements" className="text-sm text-indigo-600 hover:underline">← Engagements</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{engagement.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Scope Reminder</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.deliverable}</dd></div>
          <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.acceptanceCriteria}</dd></div>
          <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${engagement.scope.fee.toString()}</dd></div>
          <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.effortCapHours}h</dd></div>
          <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{engagement.scope.dueDate.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      {canSubmit && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Submit Deliverable</h2>
          <form action={submitDeliverableAction.bind(null, engagement.id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">File URL or link</label>
              <input
                name="fileUrl"
                type="url"
                placeholder="https://docs.google.com/... or https://drive.google.com/..."
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit</button>
          </form>
        </div>
      )}

      {engagement.deliverables.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Submitted Deliverables</h2>
          {engagement.deliverables.map(d => (
            <div key={d.id} className="text-sm">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 mr-2">{d.status}</span>
              {d.submittedAt?.toLocaleDateString()}
              {d.fileUrl && <a href={d.fileUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-indigo-600 hover:underline break-all">{d.fileUrl}</a>}
            </div>
          ))}
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
