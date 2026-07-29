'use server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { markRead, markAllRead } from '@/modules/notifications/service'
import { redirect } from 'next/navigation'

export async function markReadAction(notificationId: string) {
  await markRead(notificationId)
  redirect('/consultant/notifications')
}

export async function markAllReadAction() {
  const { userId: clerkId } = await auth()
  if (!clerkId) return
  const user = await db.user.findUnique({ where: { clerkId }, select: { id: true } })
  if (user) await markAllRead(user.id)
  redirect('/consultant/notifications')
}
