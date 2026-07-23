import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { clerkClient } from '@clerk/nextjs/server'
import { upsertUser } from '@/modules/auth-users/service'
import { createOrganization, createContact } from '@/modules/clients/service'
import { createProfile } from '@/modules/consultants/service'
import type { Role } from '@/app/generated/prisma'

type ClerkUserEvent = {
  type: 'user.created' | 'user.updated'
  data: {
    id: string
    email_addresses: { email_address: string; primary: boolean }[]
    public_metadata: { role?: Role }
    unsafe_metadata: { role?: string }
  }
}

export async function POST(req: Request) {
  const body = await req.text()
  const headerPayload = await headers()
  const svixHeaders = {
    'svix-id': headerPayload.get('svix-id') ?? '',
    'svix-timestamp': headerPayload.get('svix-timestamp') ?? '',
    'svix-signature': headerPayload.get('svix-signature') ?? '',
  }

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!)
  let event: ClerkUserEvent

  try {
    event = wh.verify(body, svixHeaders) as ClerkUserEvent
  } catch {
    return new Response('Invalid signature', { status: 400 })
  }

  const primary = event.data.email_addresses.find((e) => e.primary)
  if (!primary) return new Response('No primary email', { status: 400 })

  if (event.type === 'user.created') {
    const rawRole = event.data.unsafe_metadata?.role
    if (rawRole !== 'client' && rawRole !== 'consultant') {
      return new Response('Invalid or missing role', { status: 400 })
    }
    const role: Role = rawRole

    const clerk = await clerkClient()
    await clerk.users.updateUserMetadata(event.data.id, {
      publicMetadata: { role },
    })

    const user = await upsertUser({
      clerkId: event.data.id,
      email: primary.email_address,
      role,
    })

    if (role === 'client') {
      const domain = primary.email_address.split('@')[1] ?? 'unknown'
      const org = await createOrganization({ name: domain }, user.id)
      await createContact({
        userId: user.id,
        organizationId: org.id,
        name: primary.email_address.split('@')[0] ?? 'Client',
        email: primary.email_address,
      }, user.id)
    } else if (role === 'consultant') {
      await createProfile({ userId: user.id }, user.id)
    }

    return new Response('OK')
  }

  if (event.type === 'user.updated') {
    await upsertUser({
      clerkId: event.data.id,
      email: primary.email_address,
      role: event.data.public_metadata.role ?? 'client',
    })
  }

  return new Response('OK')
}
