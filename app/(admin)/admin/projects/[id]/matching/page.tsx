import { notFound } from 'next/navigation'
import { db } from '@/lib/db'
import { runMatchingAction, addCandidateAction } from './actions'
import { isEligible } from '@/modules/restrictions/service'
import type { ConsultantProfile, User } from '@/app/generated/prisma'

export default async function AdminMatchingPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ ran?: string }>
}) {
  const { id: projectId } = await params
  const { ran } = await searchParams

  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { scope: true },
  })
  if (!project) notFound()

  // Load eligible consultants for display (same filter as service, without AI call)
  const allCandidates = await db.consultantProfile.findMany({
    where: { approvalStatus: 'approved', accountStatus: 'active', publicationStatus: 'published' },
    include: { user: true },
  })
  const eligible: (ConsultantProfile & { user: User })[] = []
  for (const c of allCandidates) {
    const { eligible: ok } = await isEligible(c.id)
    if (ok) eligible.push(c)
  }

  // Load current shortlist + candidates so we can show who's already added
  const shortlist = await db.shortlist.findUnique({
    where: { projectId },
    include: { candidates: true },
  })
  const addedIds = new Set(shortlist?.candidates.map(c => c.consultantId) ?? [])

  // Load AI assessments from AIOutputLog (most recent matching run)
  const aiLog = await db.aIOutputLog.findFirst({
    where: { touchpoint: 'matching_assessment', inputSummary: { contains: project.title } },
    orderBy: { timestamp: 'desc' },
  })
  type Assessment = { consultantId: string; tier: string; rationale: string }
  let assessmentMap: Record<string, Assessment> = {}
  if (aiLog) {
    try {
      const parsed = JSON.parse(aiLog.output) as { assessments: Assessment[] }
      assessmentMap = Object.fromEntries(parsed.assessments.map(a => [a.consultantId, a]))
    } catch {
      assessmentMap = {}
    }
  }

  const canRun = ['READY_FOR_MATCHING', 'MATCHING_IN_PROGRESS'].includes(project.status)

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <a href={`/admin/projects/${projectId}`} className="text-sm text-indigo-600 hover:underline">← Project</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Matching — {project.title}</h1>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{project.status}</span>
      </div>

      {!project.scope && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">No scope found. Approve a scope before running matching.</p>
        </div>
      )}

      {canRun && project.scope && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Run Matching</h2>
          <p className="text-sm text-slate-500">Filters all approved/published consultants, checks restrictions, then asks AI for fit tiers. Results appear below.</p>
          <form action={runMatchingAction.bind(null, projectId)}>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-purple-600 text-white hover:bg-purple-700">Run Matching</button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-700">Eligible Consultants ({eligible.length})</h2>
        {eligible.length === 0 ? (
          <p className="text-sm text-slate-400">No eligible consultants found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {eligible.map(c => {
              const assessment = assessmentMap[c.id]
              const alreadyAdded = addedIds.has(c.id)
              return (
                <li key={c.id} className="py-3 flex items-start justify-between gap-4">
                  <div className="space-y-0.5 flex-1">
                    <div className="text-sm font-medium text-slate-900">{c.user.email}</div>
                    <div className="text-xs text-slate-400 font-mono">{c.id.slice(0, 12)}…</div>
                    {assessment && (
                      <div className="mt-1 space-y-0.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          assessment.tier === 'HIGH' ? 'bg-green-100 text-green-700' :
                          assessment.tier === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-slate-100 text-slate-500'
                        }`}>{assessment.tier}</span>
                        <p className="text-xs text-slate-500 italic">{assessment.rationale}</p>
                      </div>
                    )}
                  </div>
                  <div className="shrink-0">
                    {alreadyAdded ? (
                      <span className="text-xs text-slate-400">Added</span>
                    ) : shortlist ? (
                      <form action={addCandidateAction.bind(null, shortlist.id, c.id, projectId, assessment?.tier ?? null, assessment?.rationale ?? null)}>
                        <button type="submit" className="px-3 py-1.5 text-xs font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Add to Shortlist</button>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">Run matching first</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {shortlist && (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Shortlist ({shortlist.candidates.length} candidates)</h2>
          <a href={`/shortlists/${shortlist.id}`} className="text-sm text-indigo-600 hover:underline">Manage shortlist →</a>
        </div>
      )}
    </div>
  )
}
