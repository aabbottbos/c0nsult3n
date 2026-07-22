import { headers } from 'next/headers'
import { Webhook } from 'svix'
import { upsertUser } from '@/modules/auth-users/service'
import type { Role } from '@/app/generated/prisma'

type ClerkUserEvent = {
  type: 'user.created' | 'user.updated'
  data: {
    id: string
    email_addresses: { email_address: string; primary: boolean }[]
    public_metadata: { role?: Role }
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

  if (event.type === 'user.created' || event.type === 'user.updated') {
    const primary = event.data.email_addresses.find((e) => e.primary)
    if (!primary) return new Response('No primary email', { status: 400 })
    await upsertUser({
      clerkId: event.data.id,
      email: primary.email_address,
      role: event.data.public_metadata.role ?? 'client',
    })
  }

  return new Response('OK')
}
