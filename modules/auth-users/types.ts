import type { User, Role } from '@/app/generated/prisma'

export type UserRecord = Pick<User, 'id' | 'clerkId' | 'email' | 'role' | 'createdAt'>
export type { Role }
