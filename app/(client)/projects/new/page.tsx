import { createProjectAction } from '../actions'

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ setup?: string }> }) {
  const { setup } = await searchParams

  return (
    <div className="p-8 max-w-xl space-y-6">
      <a href="/projects" className="text-sm text-brand-600 hover:text-brand-700">← My Projects</a>
      <h1 className="text-2xl font-display font-semibold text-ink-900">New Project</h1>
      {setup && (
        <div className="bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-sm text-amber-700">
          Your account is still being set up. Please wait a moment and try again.
        </div>
      )}
      <div className="bg-white rounded-lg border border-ink-100 shadow-sm p-6">
        <form action={createProjectAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">Project title</label>
            <input
              name="title"
              required
              placeholder="e.g. Competitive Landscape Analysis"
              className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-700 mb-1">What do you need?</label>
            <textarea
              name="description"
              required
              rows={5}
              placeholder="Describe what you're trying to accomplish, what you have available, and what a successful outcome looks like..."
              className="w-full border border-ink-200 rounded-md px-3 py-2 text-sm text-ink-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded-pill bg-brand-600 text-white hover:opacity-90 transition-opacity"
          >
            Submit project
          </button>
        </form>
      </div>
    </div>
  )
}
