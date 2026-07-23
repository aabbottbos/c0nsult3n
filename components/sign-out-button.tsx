'use client'

import { useClerk } from '@clerk/nextjs'

export function SignOutButton() {
  const { signOut } = useClerk()
  return (
    <button
      onClick={() => signOut({ redirectUrl: '/sign-in' })}
      className="text-xs text-slate-500 hover:text-slate-300"
    >
      Sign out
    </button>
  )
}
