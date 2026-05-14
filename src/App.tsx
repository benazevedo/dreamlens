import { BarChart3, Brain, Database, Play, Upload } from 'lucide-react'

function App() {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-950">
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-gray-200 bg-white p-6">
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight">DreamLens</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI venture analyst
          </p>
        </div>

        <nav className="space-y-2">
          <a className="flex items-center gap-3 rounded-xl bg-gray-100 px-4 py-3 text-sm font-medium">
            <BarChart3 size={18} />
            Dashboard
          </a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
            <Database size={18} />
            Ideas
          </a>
          <a className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
            <Brain size={18} />
            Agents
          </a>
        </nav>
      </aside>

      <section className="ml-64 p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Startup Idea Scoring
            </h2>
            <p className="mt-2 text-gray-500">
              Upload your ideas, run AI analysis, and rank the best opportunities.
            </p>
          </div>

          <div className="flex gap-3">
            <button className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">
              <Upload size={16} />
              Upload CSV
            </button>
            <button className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800">
              <Play size={16} />
              Run Analysis
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Ideas" value="309" />
          <StatCard label="Analyzed" value="0" />
          <StatCard label="Top Candidates" value="0" />
          <StatCard label="Needs Review" value="0" />
        </div>

        <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold">Recent Runs</h3>
          <p className="mt-2 text-sm text-gray-500">
            No analysis runs yet. Upload the CSV and start the first DreamLens screen.
          </p>
        </div>
      </section>
    </main>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  )
}

export default App
