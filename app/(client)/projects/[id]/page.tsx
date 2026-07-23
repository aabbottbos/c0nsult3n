import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  confirmScopeAction,
  requestScopeChangesAction,
  selectProposalAction,
  acceptDeliverableAction,
} from '../actions'

export default async function ClientProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const contact = await db.clientContact.findUniqueOrThrow({ where: { userId: user.id } })

  const project = await db.project.findUnique({
    where: { id, clientId: contact.organizationId },
    include: {
      scope: true,
      shortlist: {
        include: {
          candidates: {
            include: {
              consultant: true,
              invitations: {
                include: { proposals: { where: { status: 'SUBMITTED' } } },
              },
            },
          },
        },
      },
      engagements: {
        where: { status: { notIn: ['CANCELLED'] } },
        include: {
          deliverables: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        take: 1,
      },
    },
  })
  if (!project) notFound()

  const engagement = project.engagements[0] ?? null
  const latestDeliverable = engagement?.deliverables[0] ?? null

  return (
    <div className="p-8 space-y-6">
      <a href="/projects" className="text-sm text-indigo-600 hover:underline">← My Projects</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{project.status}</span>
      </div>

      {['SUBMITTED', 'UNDER_ADMIN_REVIEW', 'NEEDS_CLARIFICATION'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project under review</h2>
          <p className="text-sm text-slate-500">Our team is reviewing your project and will define the scope. We'll notify you when it's ready.</p>
        </div>
      )}

      {project.status === 'SCOPE_APPROVED' && project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Review Your Scope</h2>
          <p className="text-sm text-slate-500">Our team has defined the scope below. Confirm to proceed to matching, or request changes.</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{project.scope.deliverable}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{project.scope.acceptanceCriteria}</dd></div>
            <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${project.scope.fee.toString()}</dd></div>
            <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{project.scope.effortCapHours}h</dd></div>
            <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{project.scope.dueDate.toLocaleDateString()}</dd></div>
            {project.scope.assumptions && <div className="col-span-2"><dt className="text-slate-500">Assumptions</dt><dd className="text-slate-900 mt-0.5">{project.scope.assumptions}</dd></div>}
            {project.scope.exclusions && <div className="col-span-2"><dt className="text-slate-500">Exclusions</dt><dd className="text-slate-900 mt-0.5">{project.scope.exclusions}</dd></div>}
          </dl>
          <div className="flex gap-3 pt-2">
            <form action={confirmScopeAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Confirm Scope</button>
            </form>
            <form action={requestScopeChangesAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200">Request Changes</button>
            </form>
          </div>
        </div>
      )}

      {['CLIENT_CONFIRMED', 'READY_FOR_MATCHING', 'MATCHING_IN_PROGRESS'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Finding your consultant</h2>
          <p className="text-sm text-slate-500">We're matching your project to the best available consultants. We'll notify you when the shortlist is ready.</p>
        </div>
      )}

      {project.status === 'SHORTLIST_READY' && project.shortlist && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Your Consultant Shortlist</h2>
          <p className="text-sm text-slate-500">We matched {project.shortlist.candidates.length} consultant{project.shortlist.candidates.length !== 1 ? 's' : ''} for your project.</p>
          <div className="space-y-4">
            {project.shortlist.candidates.map(c => {
              const proposal = c.invitations.flatMap(i => i.proposals)[0] ?? null
              return (
                <div key={c.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-slate-900 text-sm">Consultant {c.consultantId.slice(0, 8)}…</div>
                      {c.rationale && <p className="text-sm text-slate-600 mt-1 italic">"{c.rationale}"</p>}
                    </div>
                    {proposal
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">Proposal in</span>
                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">Awaiting proposal</span>
                    }
                  </div>
                  {proposal && (
                    <>
                      <p className="text-sm text-slate-700">{proposal.fitStatement}</p>
                      <form action={selectProposalAction.bind(null, proposal.id, project.id)}>
                        <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Select this consultant</button>
                      </form>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {['ENGAGEMENT_CREATED'].includes(project.status) && engagement && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Engagement</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{engagement.status}</span>
          </div>
          {latestDeliverable && engagement.status === 'UNDER_REVIEW' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">A deliverable has been submitted for your review.</p>
              <div className="flex gap-3">
                <form action={acceptDeliverableAction.bind(null, engagement.id, project.id)}>
                  <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Accept Deliverable</button>
                </form>
                <a href={`/projects/${project.id}/engagement/${engagement.id}`} className="px-3 py-1.5 text-sm font-medium rounded bg-slate-100 text-slate-700 hover:bg-slate-200">View Details</a>
              </div>
            </div>
          )}
          {engagement.status !== 'UNDER_REVIEW' && (
            <a href={`/projects/${project.id}/engagement/${engagement.id}`} className="text-sm text-indigo-600 hover:underline">View engagement →</a>
          )}
        </div>
      )}

      {project.status === 'CLOSED' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project closed</h2>
          <p className="text-sm text-slate-500">This project has been completed and closed.</p>
        </div>
      )}

      {project.status === 'CANCELLED' && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Project cancelled</h2>
          <p className="text-sm text-slate-500">This project was cancelled.</p>
        </div>
      )}
    </div>
  )
}
