import { auth } from '@clerk/nextjs/server'

export default async function DebugPage() {
  const { userId, sessionClaims } = await auth()
  return (
    <pre style={{ padding: 32, fontFamily: 'monospace', fontSize: 14 }}>
      {JSON.stringify({ userId, sessionClaims }, null, 2)}
    </pre>
  )
}
