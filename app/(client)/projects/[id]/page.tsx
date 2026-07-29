import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import {
  confirmScopeAction,
  requestScopeChangesAction,
  selectProposalAction,
  acceptDeliverableAction,
} from '../actions'

function humanStatus(s: string) {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, c => c.toUpperCase())
}

export default async function ClientProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = userId ? await db.user.findUnique({ where: { clerkId: userId } }) : null
  const contact = user ? await db.clientContact.findUnique({ where: { userId: user.id } }) : null
  if (!contact) notFound()

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
                include: { proposals: { where: { status: { in: ['SUBMITTED', 'PENDING_ADMIN_REVIEW'] } } } },
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
      <a href="/projects" className="text-sm text-brand-600 hover:text-brand-700">← My Projects</a>
      <div className="flex items-start justify-between">
        <h1 className="text-2xl font-display font-semibold text-ink-900">{project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-600">{humanStatus(project.status)}</span>
      </div>

      {['SUBMITTED', 'UNDER_ADMIN_REVIEW', 'NEEDS_CLARIFICATION'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Project under review</h2>
          <p className="text-sm text-ink-400">Our team is reviewing your project and will define the scope. We'll notify you when it's ready.</p>
        </div>
      )}

      {project.status === 'SCOPE_APPROVED' && project.scope && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-700">Review your scope</h2>
          <p className="text-sm text-ink-400">Our team has defined the scope below. Confirm to proceed to matching, or request changes.</p>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-ink-400">Deliverable</dt><dd className="text-ink-900 mt-0.5">{project.scope.deliverable}</dd></div>
            <div className="col-span-2"><dt className="text-ink-400">Acceptance criteria</dt><dd className="text-ink-900 mt-0.5">{project.scope.acceptanceCriteria}</dd></div>
            <div><dt className="text-ink-400">Fee</dt><dd className="font-mono text-ink-900 mt-0.5">${project.scope.fee.toString()}</dd></div>
            <div><dt className="text-ink-400">Effort cap</dt><dd className="font-mono text-ink-900 mt-0.5">{project.scope.effortCapHours}h</dd></div>
            <div><dt className="text-ink-400">Due date</dt><dd className="text-ink-900 mt-0.5">{project.scope.dueDate.toLocaleDateString()}</dd></div>
            {project.scope.assumptions && <div className="col-span-2"><dt className="text-ink-400">Assumptions</dt><dd className="text-ink-900 mt-0.5">{project.scope.assumptions}</dd></div>}
            {project.scope.exclusions && <div className="col-span-2"><dt className="text-ink-400">Exclusions</dt><dd className="text-ink-900 mt-0.5">{project.scope.exclusions}</dd></div>}
          </dl>
          <div className="flex gap-3 pt-2">
            <form action={confirmScopeAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Confirm scope</button>
            </form>
            <form action={requestScopeChangesAction.bind(null, project.scope.id, project.id)}>
              <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-ink-100 text-ink-700 hover:bg-ink-200">Request changes</button>
            </form>
          </div>
        </div>
      )}

      {['CLIENT_CONFIRMED', 'READY_FOR_MATCHING', 'MATCHING_IN_PROGRESS'].includes(project.status) && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Finding your consultant</h2>
          <p className="text-sm text-ink-400">We're matching your project to the best available consultants. We'll notify you when the shortlist is ready.</p>
        </div>
      )}

      {project.status === 'SHORTLIST_READY' && project.shortlist && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink-700">Your consultant shortlist</h2>
          <p className="text-sm text-ink-400">We matched {project.shortlist.candidates.length} consultant{project.shortlist.candidates.length !== 1 ? 's' : ''} for your project.</p>
          <div className="space-y-4">
            {project.shortlist.candidates.map(c => {
              const proposal = c.invitations.flatMap(i => i.proposals)[0] ?? null
              const isPendingReview = proposal?.status === 'PENDING_ADMIN_REVIEW'
              return (
                <div key={c.id} className="border border-ink-100 rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-medium text-ink-900 text-sm">Consultant {c.consultantId.slice(0, 8)}…</div>
                      {c.rationale && <p className="text-sm text-ink-600 mt-1 italic">"{c.rationale}"</p>}
                    </div>
                    {isPendingReview
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">Proposal in — under review</span>
                      : proposal
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-50 text-teal-700">Proposal in</span>
                        : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-400">Awaiting proposal</span>
                    }
                  </div>
                  {proposal && !isPendingReview && (
                    <>
                      <p className="text-sm text-ink-700">{proposal.fitStatement}</p>
                      <form action={selectProposalAction.bind(null, proposal.id, project.id)}>
                        <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Select this consultant</button>
                      </form>
                    </>
                  )}
                  {isPendingReview && (
                    <p className="text-xs text-ink-400">This consultant has proposed some scope adjustments. We're reviewing them and will update you shortly.</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {['ENGAGEMENT_CREATED'].includes(project.status) && engagement && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-700">Engagement</h2>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-ink-100 text-ink-600">{humanStatus(engagement.status)}</span>
          </div>
          {latestDeliverable && engagement.status === 'UNDER_REVIEW' && (
            <div className="space-y-3">
              <p className="text-sm text-ink-600">A deliverable has been submitted for your review.</p>
              <div className="flex gap-3">
                <form action={acceptDeliverableAction.bind(null, engagement.id, project.id)}>
                  <button type="submit" className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity">Accept deliverable</button>
                </form>
                <a href={`/projects/${project.id}/engagement/${engagement.id}`} className="px-4 py-2 text-sm font-medium rounded-pill bg-ink-100 text-ink-700 hover:bg-ink-200">View details</a>
              </div>
            </div>
          )}
          {engagement.status !== 'UNDER_REVIEW' && (
            <a href={`/projects/${project.id}/engagement/${engagement.id}`} className="text-sm text-brand-600 hover:text-brand-700">View engagement →</a>
          )}
        </div>
      )}

      {project.status === 'CLOSED' && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Project closed</h2>
          <p className="text-sm text-ink-400">This project has been completed and closed.</p>
        </div>
      )}

      {project.status === 'CANCELLED' && (
        <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6">
          <h2 className="text-sm font-semibold text-ink-700 mb-2">Project cancelled</h2>
          <p className="text-sm text-ink-400">This project was cancelled.</p>
        </div>
      )}
    </div>
  )
}
