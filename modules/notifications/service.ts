import { db } from '@/lib/db'
import type { NotificationInput } from './types'

export async function createNotification(input: NotificationInput): Promise<void> {
  try {
    await db.notification.create({
      data: {
        recipientId: input.recipientId,
        type: input.type,
        body: input.body,
        link: input.link,
      },
    })
  } catch (err) {
    console.error('[notifications] Failed to create notification:', input.type, err)
  }
}

export async function markRead(notificationId: string): Promise<void> {
  await db.notification.update({ where: { id: notificationId }, data: { read: true } })
}

export async function markAllRead(recipientId: string): Promise<void> {
  await db.notification.updateMany({ where: { recipientId, read: false }, data: { read: true } })
}

export async function listNotifications(recipientId: string) {
  return db.notification.findMany({
    where: { recipientId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
}

export async function countUnread(recipientId: string): Promise<number> {
  return db.notification.count({ where: { recipientId, read: false } })
}
