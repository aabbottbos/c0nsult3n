'use client'
import { useSignUp } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export default function SignUpPage() {
  const { signUp } = useSignUp()
  const router = useRouter()
  const [step, setStep] = useState<'credentials' | 'role'>('credentials')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'client' | 'consultant' | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault()
    if (!signUp) return
    setLoading(true)
    setError('')
    try {
      await signUp.create({ emailAddress: email, password })
      setStep('role')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleRole(e: React.FormEvent) {
    e.preventDefault()
    if (!signUp || !role) return
    setLoading(true)
    setError('')
    try {
      await signUp.update({ unsafeMetadata: { role } })
      if (signUp.status === 'complete') {
        await signUp.finalize()
        router.push(role === 'client' ? '/projects' : '/invitations')
      } else {
        await signUp.verifications.sendEmailCode()
        router.push('/sign-up/verify')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Role selection failed')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'credentials') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="bg-white rounded-lg border border-slate-200 p-8 w-full max-w-sm space-y-6">
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <form onSubmit={handleCredentials} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-3 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </button>
          </form>
          <p className="text-sm text-slate-500 text-center">
            Already have an account? <a href="/sign-in" className="text-indigo-600 hover:underline">Sign in</a>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="bg-white rounded-lg border border-slate-200 p-8 w-full max-w-sm space-y-6">
        <h1 className="text-xl font-semibold text-slate-900">How will you use Consulten?</h1>
        <form onSubmit={handleRole} className="space-y-4">
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setRole('client')}
              className={`w-full text-left border rounded-lg p-4 transition-colors ${role === 'client' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="font-medium text-slate-900">I'm hiring a consultant</div>
              <div className="text-sm text-slate-500 mt-1">Post projects and work with expert consultants</div>
            </button>
            <button
              type="button"
              onClick={() => setRole('consultant')}
              className={`w-full text-left border rounded-lg p-4 transition-colors ${role === 'consultant' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 hover:border-slate-300'}`}
            >
              <div className="font-medium text-slate-900">I'm a consultant</div>
              <div className="text-sm text-slate-500 mt-1">Find fixed-scope projects that match your expertise</div>
            </button>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading || !role}
            className="w-full px-3 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Setting up your account...' : 'Get started'}
          </button>
        </form>
      </div>
    </div>
  )
}
