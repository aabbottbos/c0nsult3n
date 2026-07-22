import { db } from '@/lib/db'
import type { Role } from '@/app/generated/prisma'

export async function upsertUser(data: { clerkId: string; email: string; role: Role }) {
  return db.user.upsert({
    where: { clerkId: data.clerkId },
    update: { email: data.email, role: data.role },
    create: { clerkId: data.clerkId, email: data.email, role: data.role },
  })
}
