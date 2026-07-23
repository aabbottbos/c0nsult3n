import { clerkMiddleware } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import type { Role } from '@/app/generated/prisma'

export default clerkMiddleware(async (auth, req) => {
  const publicPaths = ['/sign-in', '/sign-up', '/api/webhooks']
  const isPublic = publicPaths.some(p => req.nextUrl.pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const { sessionClaims } = await auth.protect()

  const role = (sessionClaims?.metadata as { role?: Role } | undefined)?.role
  const pathname = req.nextUrl.pathname

  if (pathname === '/' || pathname === '/dashboard') {
    if (role === 'client') return NextResponse.redirect(new URL('/projects', req.url))
    if (role === 'consultant') return NextResponse.redirect(new URL('/invitations', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/:path*',
  ],
}
