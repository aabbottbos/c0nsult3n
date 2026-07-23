import { createProjectAction } from '../actions'

export default function NewProjectPage() {
  return (
    <div className="p-8 max-w-xl space-y-6">
      <a href="/projects" className="text-sm text-indigo-600 hover:underline">← My Projects</a>
      <h1 className="text-xl font-semibold text-slate-900">New Project</h1>
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <form action={createProjectAction} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Project title</label>
            <input
              name="title"
              required
              placeholder="e.g. Competitive Landscape Analysis"
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">What do you need?</label>
            <textarea
              name="description"
              required
              rows={5}
              placeholder="Describe what you're trying to accomplish, what you have available, and what a successful outcome looks like..."
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 text-sm font-medium rounded bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Submit Project
          </button>
        </form>
      </div>
    </div>
  )
}
