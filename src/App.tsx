import { useMemo, useState } from 'react'
import { BarChart3, Brain, Database, Play, Upload } from 'lucide-react'
import { parseIdeasCsv } from './lib/parseIdeasCsv'
import type { IdeaRow } from './types/idea'

function App() {
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [selectedIdea, setSelectedIdea] = useState<IdeaRow | null>(null)
  const [isParsing, setIsParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const stats = useMemo(() => {
    return {
      total: ideas.length,
      completed: ideas.filter((idea) => idea.status === 'completed').length,
      needsReview: ideas.filter((idea) => idea.status === 'needs_review').length,
      running: ideas.filter((idea) => idea.status === 'running').length,
    }
  }, [ideas])

  async function handleFileUpload(file: File | undefined) {
    if (!file) return

    setIsParsing(true)
    setError(null)

    try {
      const parsedIdeas = await parseIdeasCsv(file)
      setIdeas(parsedIdeas)
      setSelectedIdea(parsedIdeas[0] ?? null)
    } catch (err) {
      console.error(err)
      setError('Could not parse CSV. Check the file format and try again.')
    } finally {
      setIsParsing(false)
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950">
      <aside className="fixed left-0 top-0 h-screen w-64 border-r border-gray-200 bg-white p-6">
        <div className="mb-10">
          <h1 className="text-2xl font-bold tracking-tight">DreamLens</h1>
          <p className="mt-1 text-sm text-gray-500">AI venture analyst</p>
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
        <div className="mb-8 flex items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">
              Startup Idea Scoring
            </h2>
            <p className="mt-2 text-gray-500">
              Upload your ideas, run AI analysis, and rank the best opportunities.
            </p>
          </div>

          <div className="flex gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50">
              <Upload size={16} />
              {isParsing ? 'Parsing...' : 'Upload CSV'}
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(event) => handleFileUpload(event.target.files?.[0])}
              />
            </label>

            <button
              disabled={ideas.length === 0}
              className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={16} />
              Run Analysis
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Ideas" value={String(stats.total)} />
          <StatCard label="Analyzed" value={String(stats.completed)} />
          <StatCard label="Running" value={String(stats.running)} />
          <StatCard label="Needs Review" value={String(stats.needsReview)} />
        </div>

        <div className="mt-8 grid grid-cols-[1fr_420px] gap-6">
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 p-5">
              <h3 className="text-lg font-semibold">Ideas</h3>
              <p className="mt-1 text-sm text-gray-500">
                {ideas.length === 0
                  ? 'Upload your CSV to start.'
                  : `${ideas.length} ideas loaded.`}
              </p>
            </div>

            <div className="max-h-[620px] overflow-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="border-b border-gray-200 px-4 py-3">ID</th>
                    <th className="border-b border-gray-200 px-4 py-3">Idea</th>
                    <th className="border-b border-gray-200 px-4 py-3">Industry</th>
                    <th className="border-b border-gray-200 px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {ideas.map((idea) => (
                    <tr
                      key={`${idea.id}-${idea.rowNumber}`}
                      onClick={() => setSelectedIdea(idea)}
                      className="cursor-pointer border-b border-gray-100 hover:bg-gray-50"
                    >
                      <td className="px-4 py-3 text-gray-500">{idea.id}</td>
                      <td className="max-w-xl px-4 py-3 font-medium">
                        {idea.idea || 'Untitled idea'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {idea.industries.length > 0
                          ? idea.industries.join(', ')
                          : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                          {idea.status.replace('_', ' ')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <IdeaDetail idea={selectedIdea} />
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

function IdeaDetail({ idea }: { idea: IdeaRow | null }) {
  if (!idea) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Idea Detail</h3>
        <p className="mt-2 text-sm text-gray-500">
          Select an idea to inspect it.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Idea #{idea.id}
        </p>
        <h3 className="mt-1 text-xl font-bold">{idea.idea || 'Untitled idea'}</h3>
      </div>

      <DetailSection label="Description" value={idea.description} />
      <DetailSection label="Problem Being Solved" value={idea.problem} />
      <DetailSection label="Target Audience" value={idea.targetAudience} />
      <DetailSection label="Product Name" value={idea.productName} />
      <DetailSection label="Competitors" value={idea.competitors} />
      <DetailSection label="Ethics Risk" value={idea.ethicsRisk} />

      <div className="mt-5 rounded-xl bg-gray-50 p-4">
        <h4 className="text-sm font-semibold">Existing Scores</h4>
        <dl className="mt-3 space-y-2 text-sm">
          <ScoreRow label="Problem Severity" value={idea.problemSeverity} />
          <ScoreRow label="Willingness to Pay" value={idea.willingnessToPay} />
          <ScoreRow label="Market Size" value={idea.marketSize} />
          <ScoreRow label="Audience Clarity" value={idea.audienceClarity} />
          <ScoreRow label="Founder Fit" value={idea.founderIdeaFit} />
          <ScoreRow label="Competitive Whitespace" value={idea.competitiveWhitespace} />
          <ScoreRow label="Speed to MVP" value={idea.speedToMvp} />
        </dl>
      </div>
    </div>
  )
}

function DetailSection({ label, value }: { label: string; value?: string }) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold">{label}</h4>
      <p className="mt-1 text-sm leading-6 text-gray-600">{value || '—'}</p>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

export default App
