import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitProposalAction, declineInvitationAction, withdrawProposalAction } from '../actions'

export default async function ConsultantInvitationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { userId } = await auth()
  const user = await db.user.findUniqueOrThrow({ where: { clerkId: userId! } })
  const profile = await db.consultantProfile.findUniqueOrThrow({ where: { userId: user.id } })

  const invitation = await db.consultantInvitation.findUnique({
    where: { id, consultantId: profile.id },
    include: {
      project: { include: { scope: true } },
      proposals: { where: { consultantId: profile.id } },
    },
  })
  if (!invitation) notFound()

  const existingProposal = invitation.proposals[0] ?? null
  const canRespond = ['SENT', 'VIEWED', 'QUESTIONS_ASKED'].includes(invitation.status)
  const canWithdraw = existingProposal && ['SUBMITTED', 'PENDING_ADMIN_REVIEW'].includes(existingProposal.status)

  return (
    <div className="p-8 space-y-6 max-w-2xl">
      <a href="/invitations" className="text-sm text-indigo-600 hover:underline">← Invitations</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">{invitation.project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{invitation.status}</span>
      </div>

      {invitation.project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Scope</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="col-span-2"><dt className="text-slate-500">Deliverable</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.deliverable}</dd></div>
            <div className="col-span-2"><dt className="text-slate-500">Acceptance criteria</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.acceptanceCriteria}</dd></div>
            <div><dt className="text-slate-500">Fee</dt><dd className="text-slate-900 mt-0.5">${invitation.project.scope.fee.toString()}</dd></div>
            <div><dt className="text-slate-500">Effort cap</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.effortCapHours}h</dd></div>
            <div><dt className="text-slate-500">Due date</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.dueDate.toLocaleDateString()}</dd></div>
            {invitation.project.scope.assumptions && <div className="col-span-2"><dt className="text-slate-500">Assumptions</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.assumptions}</dd></div>}
            {invitation.project.scope.exclusions && <div className="col-span-2"><dt className="text-slate-500">Exclusions</dt><dd className="text-slate-900 mt-0.5">{invitation.project.scope.exclusions}</dd></div>}
          </dl>
        </div>
      )}

      {existingProposal ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Your Proposal</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              existingProposal.status === 'PENDING_ADMIN_REVIEW' ? 'bg-amber-100 text-amber-700' :
              existingProposal.status === 'SELECTED' ? 'bg-green-100 text-green-700' :
              existingProposal.status === 'WITHDRAWN' || existingProposal.status === 'NOT_SELECTED' || existingProposal.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
              'bg-slate-100 text-slate-700'
            }`}>{existingProposal.status}</span>
          </div>
          <p className="text-sm text-slate-600">{existingProposal.fitStatement}</p>
          {existingProposal.status === 'PENDING_ADMIN_REVIEW' && (
            <p className="text-xs text-amber-700">Your proposal includes deviations and is under admin review before the client can see it.</p>
          )}
          <p className="text-xs text-slate-400">Submitted {existingProposal.createdAt.toLocaleDateString()}</p>
          {canWithdraw && (
            <form action={withdrawProposalAction.bind(null, existingProposal.id, invitation.id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-50 text-red-600 hover:bg-red-100">Withdraw Proposal</button>
            </form>
          )}
        </div>
      ) : canRespond ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">Submit Your Proposal</h2>
          <form action={submitProposalAction.bind(null, invitation.id)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Why are you a strong fit?</label>
              <textarea
                name="fitStatement"
                required
                rows={5}
                placeholder="Describe your relevant experience, approach, and why you're well-suited for this specific scope..."
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <p className="text-sm font-medium text-slate-700">Request changes to scope (optional)</p>
              <p className="text-xs text-slate-500">Leave blank if you agree with the scope as written. Any changes require admin review before the client can select you.</p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fee change</label>
                <input type="text" name="deviationFee" placeholder="e.g. I need $200 more due to additional complexity" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Timeline change</label>
                <input type="text" name="deviationTiming" placeholder="e.g. I can deliver by Feb 15 instead of Feb 1" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Deliverable change</label>
                <input type="text" name="deviationDeliverable" placeholder="e.g. I'd deliver a slide deck instead of a written report" className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Submit Proposal</button>
              <form action={declineInvitationAction.bind(null, invitation.id)}>
                <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-50 text-red-600 hover:bg-red-100">Decline</button>
              </form>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  )
}
