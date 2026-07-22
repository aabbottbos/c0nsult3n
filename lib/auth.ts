import { auth, currentUser } from '@clerk/nextjs/server'
import { notFound } from 'next/navigation'
import type { Role } from '@/app/generated/prisma'

export async function requireRole(role: Role) {
  const { sessionClaims } = await auth()
  const userRole = (sessionClaims?.metadata as { role?: Role } | undefined)?.role
  if (userRole !== role) notFound()
  return userRole
}

export async function getAuthRole(): Promise<Role | null> {
  const { sessionClaims } = await auth()
  return ((sessionClaims?.metadata as { role?: Role } | undefined)?.role) ?? null
}

export { currentUser }
