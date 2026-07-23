import { notFound } from 'next/navigation'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { submitProposalAction, declineInvitationAction } from '../actions'

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
  const canRespond = ['SENT', 'VIEWED', 'QUESTIONS_ASKED', 'ACCEPTED_INTEREST'].includes(invitation.status)

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
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Your Proposal</h2>
          <p className="text-sm text-slate-600">{existingProposal.fitStatement}</p>
          <p className="text-xs text-slate-400 mt-2">Submitted {existingProposal.createdAt.toLocaleDateString()}</p>
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
            <div className="flex gap-3">
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
