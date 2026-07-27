import { describe, it, expect } from 'vitest'
import { upsertUser } from '@/modules/auth-users/service'
import { createNotification, markRead, markAllRead, listNotifications, countUnread } from '@/modules/notifications/service'

describe('Notifications', () => {
  it('createNotification writes a record for the recipient', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_1', email: 'user1@notif.test', role: 'consultant' })

    await createNotification({
      recipientId: user.id,
      type: 'INVITATION_SENT',
      body: 'You have been invited to a project: Test Project',
      link: '/invitations/abc123',
    })

    const notifications = await listNotifications(user.id)
    expect(notifications).toHaveLength(1)
    expect(notifications[0].type).toBe('INVITATION_SENT')
    expect(notifications[0].read).toBe(false)
    expect(notifications[0].link).toBe('/invitations/abc123')
  })

  it('countUnread returns correct count and decrements on markRead', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_2', email: 'user2@notif.test', role: 'client' })

    await createNotification({ recipientId: user.id, type: 'DELIVERABLE_SUBMITTED', body: 'Deliverable ready', link: '/projects/p1/engagement/e1' })
    await createNotification({ recipientId: user.id, type: 'AI_QA_COMPLETE', body: 'QA done', link: '/projects/p1/engagement/e1' })

    expect(await countUnread(user.id)).toBe(2)

    const [first] = await listNotifications(user.id)
    await markRead(first.id)

    expect(await countUnread(user.id)).toBe(1)
  })

  it('markAllRead clears all unread for recipient', async () => {
    const user = await upsertUser({ clerkId: 'notif_user_3', email: 'user3@notif.test', role: 'client' })

    await createNotification({ recipientId: user.id, type: 'ENGAGEMENT_STARTED', body: 'Engagement started', link: '/projects/p1/engagement/e1' })
    await createNotification({ recipientId: user.id, type: 'ENGAGEMENT_CLOSED', body: 'Engagement closed', link: '/projects/p1/engagement/e1' })

    await markAllRead(user.id)

    expect(await countUnread(user.id)).toBe(0)
    const all = await listNotifications(user.id)
    expect(all.every(n => n.read)).toBe(true)
  })

  it('notifications are scoped per recipient — user B cannot see user A notifications', async () => {
    const userA = await upsertUser({ clerkId: 'notif_userA', email: 'userA@notif.test', role: 'consultant' })
    const userB = await upsertUser({ clerkId: 'notif_userB', email: 'userB@notif.test', role: 'client' })

    await createNotification({ recipientId: userA.id, type: 'INVITATION_SENT', body: 'A gets this', link: '/invitations/xyz' })

    const bNotifs = await listNotifications(userB.id)
    expect(bNotifs).toHaveLength(0)
  })
})
