import { requireRole } from '@/lib/auth'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { listNotifications } from '@/modules/notifications/service'
import { markReadAction, markAllReadAction } from './actions'

export default async function ConsultantNotificationsPage() {
  await requireRole('consultant')
  const { userId: clerkId } = await auth()
  const user = clerkId ? await db.user.findUnique({ where: { clerkId }, select: { id: true } }) : null
  const notifications = user ? await listNotifications(user.id) : []
  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Notifications</h1>
        {unreadCount > 0 && (
          <form action={markAllReadAction}>
            <button type="submit" className="text-sm text-indigo-600 hover:underline">Mark all read</button>
          </form>
        )}
      </div>
      {notifications.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-sm text-slate-400">No notifications yet.</div>
      ) : (
        <ul className="space-y-2">
          {notifications.map(n => (
            <li key={n.id} className={`bg-white rounded-lg border p-4 flex items-start justify-between gap-4 ${n.read ? 'border-slate-200' : 'border-indigo-200 bg-indigo-50'}`}>
              <div className="flex-1">
                <p className="text-sm text-slate-800">{n.body}</p>
                <div className="flex items-center gap-3 mt-1">
                  <a href={n.link} className="text-xs text-indigo-600 hover:underline">View →</a>
                  <span className="text-xs text-slate-400">{n.createdAt.toLocaleString()}</span>
                </div>
              </div>
              {!n.read && (
                <form action={markReadAction.bind(null, n.id)}>
                  <button type="submit" className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Dismiss</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
