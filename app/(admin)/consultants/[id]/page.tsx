import { notFound } from 'next/navigation'
import { getProfile } from '@/modules/consultants/service'
import { db } from '@/lib/db'
import {
  approveProfileAction, publishProfileAction, suspendProfileAction,
  createVerificationAction, updateVerificationAction,
  createPayoutSetupAction, updatePayoutSetupAction,
} from '../actions'

export default async function ConsultantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await getProfile(id)
  if (!profile) notFound()

  const events = await db.eventLog.findMany({ where: { entityId: id }, orderBy: { timestamp: 'desc' }, take: 20 })

  return (
    <div className="p-8 space-y-6">
      <a href="/consultants" className="text-sm text-indigo-600 hover:underline">← Consultants</a>
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Consultant Profile</h1>
        <div className="flex gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.approvalStatus}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.accountStatus}</span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700">{profile.publicationStatus}</span>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">Details</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">User ID</dt><dd className="text-slate-900 font-mono text-xs">{profile.userId}</dd></div>
          <div><dt className="text-slate-500">Created</dt><dd className="text-slate-900">{profile.createdAt.toLocaleDateString()}</dd></div>
        </dl>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          {profile.approvalStatus === 'pending' && (
            <form action={approveProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Approve</button>
            </form>
          )}
          {profile.approvalStatus === 'approved' && profile.accountStatus === 'active' && profile.publicationStatus !== 'published' && (
            <form action={publishProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">Publish</button>
            </form>
          )}
          {profile.accountStatus === 'active' && (
            <form action={suspendProfileAction.bind(null, id)}>
              <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-red-600 text-white hover:bg-red-700">Suspend</button>
            </form>
          )}
          {profile.approvalStatus !== 'pending' && profile.publicationStatus === 'published' && profile.accountStatus !== 'active' && (
            <p className="text-sm text-slate-400">No actions available.</p>
          )}
        </div>
      </div>

      {profile.restrictions.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Restrictions</h2>
          <ul className="space-y-2">
            {profile.restrictions.map(r => (
              <li key={r.id} className="text-sm text-slate-700">{r.type} {r.notes && `— ${r.notes}`}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Verification Panel */}
      {!profile.verification ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Identity Verification</h2>
          <p className="text-sm text-slate-400 mb-3">No verification record yet.</p>
          <form action={createVerificationAction.bind(null, profile.id)}>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
              Create Verification Record
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Identity Verification</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              profile.verification.identityStatus === 'VERIFIED' ? 'bg-green-100 text-green-800' :
              profile.verification.identityStatus === 'REJECTED' ? 'bg-red-100 text-red-800' :
              profile.verification.identityStatus === 'SUBMITTED' ? 'bg-blue-100 text-blue-800' :
              'bg-slate-100 text-slate-700'
            }`}>{profile.verification.identityStatus}</span>
          </div>
          <div className="text-sm space-y-1">
            {profile.verification.verifiedAt && (
              <p><span className="text-slate-500">Verified:</span> {profile.verification.verifiedAt.toLocaleDateString()}</p>
            )}
            {profile.verification.credentialNotes && (
              <p><span className="text-slate-500">Credential notes:</span> {profile.verification.credentialNotes}</p>
            )}
            {profile.verification.adminNotes && (
              <p><span className="text-slate-500">Admin notes:</span> {profile.verification.adminNotes}</p>
            )}
          </div>
          <form action={updateVerificationAction.bind(null, profile.verification.id, profile.id)} className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Update</h3>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Identity status</label>
              <select name="identityStatus" defaultValue={profile.verification.identityStatus} className="text-sm border border-slate-300 rounded px-2 py-1">
                {['NOT_SUBMITTED', 'SUBMITTED', 'VERIFIED', 'REJECTED'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Credential notes</label>
              <input name="credentialNotes" defaultValue={profile.verification.credentialNotes ?? ''} className="text-sm border border-slate-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Admin notes (internal)</label>
              <input name="adminNotes" defaultValue={profile.verification.adminNotes ?? ''} className="text-sm border border-slate-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Save</button>
          </form>
        </div>
      )}

      {/* Payout Setup Panel */}
      {!profile.payoutSetup ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">Payout Setup</h2>
          <p className="text-sm text-slate-400 mb-3">No payout record yet.</p>
          <form action={createPayoutSetupAction.bind(null, profile.id)}>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700">
              Create Payout Record
            </button>
          </form>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Payout Setup</h2>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
              profile.payoutSetup.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
              profile.payoutSetup.status === 'SUSPENDED' ? 'bg-red-100 text-red-800' :
              'bg-slate-100 text-slate-700'
            }`}>{profile.payoutSetup.status}</span>
          </div>
          <div className="text-sm space-y-1">
            {profile.payoutSetup.accountType && <p><span className="text-slate-500">Account type:</span> {profile.payoutSetup.accountType}</p>}
            {profile.payoutSetup.maskedAccount && <p><span className="text-slate-500">Account (masked):</span> {profile.payoutSetup.maskedAccount}</p>}
            {profile.payoutSetup.adminNotes && <p><span className="text-slate-500">Notes:</span> {profile.payoutSetup.adminNotes}</p>}
          </div>
          <form action={updatePayoutSetupAction.bind(null, profile.payoutSetup.id, profile.id)} className="space-y-3 pt-3 border-t border-slate-100">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Update</h3>
            <div className="flex gap-3 flex-wrap">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Account type</label>
                <input name="accountType" defaultValue={profile.payoutSetup.accountType ?? ''} placeholder="bank_transfer, paypal…" className="text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Masked account</label>
                <input name="maskedAccount" defaultValue={profile.payoutSetup.maskedAccount ?? ''} placeholder="****6789" className="text-sm border border-slate-300 rounded px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <select name="status" defaultValue={profile.payoutSetup.status} className="text-sm border border-slate-300 rounded px-2 py-1">
                  {['NOT_SET', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Admin notes</label>
              <input name="adminNotes" defaultValue={profile.payoutSetup.adminNotes ?? ''} className="text-sm border border-slate-300 rounded px-3 py-1.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded bg-slate-600 text-white hover:bg-slate-700">Save</button>
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
