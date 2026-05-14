import { useMemo, useState } from 'react'
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Database,
  Play,
  Search,
  Sparkles,
  Upload,
} from 'lucide-react'
import { parseIdeasCsv } from './lib/parseIdeasCsv'
import {
  runBulkAiScreen,
  runDeepAiScreen,
  type AnalyzedIdea,
} from './api/dreamlensApi'
import type { IdeaRow } from './types/idea'

type Page = 'dashboard' | 'ideas' | 'agents'

function getIdeaKey(idea: Pick<IdeaRow, 'id' | 'rowNumber'>) {
  return `${idea.id}-${idea.rowNumber}`
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [selectedIdea, setSelectedIdea] = useState<IdeaRow | null>(null)
  const [analyzedIdeas, setAnalyzedIdeas] = useState<Record<string, AnalyzedIdea>>({})
  const [isParsing, setIsParsing] = useState(false)
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false)
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedAnalysis = selectedIdea
    ? analyzedIdeas[getIdeaKey(selectedIdea)]
    : undefined

  const rankedIdeas = useMemo(() => {
    return [...ideas].sort((a, b) => {
      const aScore = analyzedIdeas[getIdeaKey(a)]?.overallScore ?? -1
      const bScore = analyzedIdeas[getIdeaKey(b)]?.overallScore ?? -1
      return bScore - aScore
    })
  }, [ideas, analyzedIdeas])

  const stats = useMemo(() => {
    const analyzed = Object.keys(analyzedIdeas).length
    const highPotential = Object.values(analyzedIdeas).filter(
      (analysis) => analysis.overallScore >= 75,
    ).length
    const needsReview = Object.values(analyzedIdeas).filter(
      (analysis) =>
        analysis.confidence < 0.65 ||
        analysis.scores.ethicsRisk >= 4 ||
        analysis.overallScore >= 80,
    ).length

    return {
      total: ideas.length,
      analyzed,
      highPotential,
      needsReview,
    }
  }, [ideas, analyzedIdeas])

  async function handleFileUpload(file: File | undefined) {
    if (!file) return

    setIsParsing(true)
    setError(null)
    setAnalyzedIdeas({})

    try {
      const parsedIdeas = await parseIdeasCsv(file)
      setIdeas(parsedIdeas)
      setSelectedIdea(parsedIdeas[0] ?? null)
      setPage('ideas')
    } catch (err) {
      console.error(err)
      setError('Could not parse CSV. Check the file format and try again.')
    } finally {
      setIsParsing(false)
    }
  }

  async function handleRunBulkAnalysis(limit = 25) {
    if (ideas.length === 0) return

    setIsBulkAnalyzing(true)
    setError(null)

    const ideasToAnalyze = ideas
      .filter((idea) => !analyzedIdeas[getIdeaKey(idea)])
      .slice(0, limit)

    const runningKeys = new Set(ideasToAnalyze.map(getIdeaKey))

    setIdeas((currentIdeas) =>
      currentIdeas.map((idea) =>
        runningKeys.has(getIdeaKey(idea))
          ? { ...idea, status: 'running' }
          : idea,
      ),
    )

    try {
      const results = await runBulkAiScreen(ideasToAnalyze, limit)

      const returnedKeys = new Set(
        results.map((result) => `${result.id}-${result.rowNumber}`),
      )

      setAnalyzedIdeas((current) => {
        const next = { ...current }

        for (const result of results) {
          next[`${result.id}-${result.rowNumber}`] = result
        }

        return next
      })

      setIdeas((currentIdeas) =>
        currentIdeas.map((idea) => {
          const key = getIdeaKey(idea)

          if (returnedKeys.has(key)) {
            return { ...idea, status: 'completed' }
          }

          if (runningKeys.has(key)) {
            return { ...idea, status: 'failed' }
          }

          return idea
        }),
      )

      setPage('ideas')
    } catch (err) {
      console.error(err)
      setError('Bulk analysis failed. Check the backend terminal for details.')

      setIdeas((currentIdeas) =>
        currentIdeas.map((idea) =>
          runningKeys.has(getIdeaKey(idea))
            ? { ...idea, status: 'failed' }
            : idea,
        ),
      )
    } finally {
      setIsBulkAnalyzing(false)
    }
  }

  async function handleRunDeepAnalysis() {
    if (!selectedIdea) return

    setIsDeepAnalyzing(true)
    setError(null)

    const selectedKey = getIdeaKey(selectedIdea)

    setIdeas((currentIdeas) =>
      currentIdeas.map((idea) =>
        getIdeaKey(idea) === selectedKey
          ? { ...idea, status: 'running' }
          : idea,
      ),
    )

    try {
      const results = await runDeepAiScreen([selectedIdea], 1)
      const result = results[0]

      if (!result) {
        throw new Error('No deep analysis result returned.')
      }

      setAnalyzedIdeas((current) => ({
        ...current,
        [selectedKey]: result,
      }))

      setIdeas((currentIdeas) =>
        currentIdeas.map((idea) =>
          getIdeaKey(idea) === selectedKey
            ? { ...idea, status: 'completed' }
            : idea,
        ),
      )

      setPage('dashboard')
    } catch (err) {
      console.error(err)
      setError('Deep analysis failed. Check the backend terminal for details.')

      setIdeas((currentIdeas) =>
        currentIdeas.map((idea) =>
          getIdeaKey(idea) === selectedKey
            ? { ...idea, status: 'failed' }
            : idea,
        ),
      )
    } finally {
      setIsDeepAnalyzing(false)
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
          <SidebarButton
            active={page === 'dashboard'}
            icon={<BarChart3 size={18} />}
            label="Dashboard"
            onClick={() => setPage('dashboard')}
          />
          <SidebarButton
            active={page === 'ideas'}
            icon={<Database size={18} />}
            label="Ideas"
            onClick={() => setPage('ideas')}
          />
          <SidebarButton
            active={page === 'agents'}
            icon={<Brain size={18} />}
            label="Agents"
            onClick={() => setPage('agents')}
          />
        </nav>

        <div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-gray-50 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Current Status
          </p>
          <p className="mt-2 text-sm text-gray-700">
            {stats.analyzed} of {stats.total} ideas analyzed
          </p>
        </div>
      </aside>

      <section className="ml-64 p-8">
        <Header
          isParsing={isParsing}
          onFileUpload={handleFileUpload}
          onRunBulkAnalysis={() => handleRunBulkAnalysis(25)}
          isBulkAnalyzing={isBulkAnalyzing}
          hasIdeas={ideas.length > 0}
        />

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {page === 'dashboard' && (
          <DashboardPage
            stats={stats}
            rankedIdeas={rankedIdeas}
            analyzedIdeas={analyzedIdeas}
            selectedIdea={selectedIdea}
            selectedAnalysis={selectedAnalysis}
            onSelectIdea={setSelectedIdea}
            onRunDeepAnalysis={handleRunDeepAnalysis}
            isDeepAnalyzing={isDeepAnalyzing}
          />
        )}

        {page === 'ideas' && (
          <IdeasPage
            ideas={rankedIdeas}
            analyzedIdeas={analyzedIdeas}
            selectedIdea={selectedIdea}
            onSelectIdea={setSelectedIdea}
            onGoToDetail={() => setPage('dashboard')}
          />
        )}

        {page === 'agents' && (
          <AgentsPage
            ideas={ideas}
            analyzedCount={stats.analyzed}
            selectedIdea={selectedIdea}
            selectedAnalysis={selectedAnalysis}
            onRunBulk25={() => handleRunBulkAnalysis(25)}
            onRunBulk100={() => handleRunBulkAnalysis(100)}
            onRunDeepAnalysis={handleRunDeepAnalysis}
            isBulkAnalyzing={isBulkAnalyzing}
            isDeepAnalyzing={isDeepAnalyzing}
          />
        )}
      </section>
    </main>
  )
}

function Header({
  isParsing,
  onFileUpload,
  onRunBulkAnalysis,
  isBulkAnalyzing,
  hasIdeas,
}: {
  isParsing: boolean
  onFileUpload: (file: File | undefined) => void
  onRunBulkAnalysis: () => void
  isBulkAnalyzing: boolean
  hasIdeas: boolean
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          Startup Idea Scoring
        </h2>
        <p className="mt-2 text-gray-500">
          Upload ideas, run AI analysis, and rank the best opportunities.
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
            onChange={(event) => onFileUpload(event.target.files?.[0])}
          />
        </label>

        <button
          disabled={!hasIdeas || isBulkAnalyzing}
          onClick={onRunBulkAnalysis}
          className="flex items-center gap-2 rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Play size={16} />
          {isBulkAnalyzing ? 'Analyzing...' : 'Run Bulk Screen'}
        </button>
      </div>
    </div>
  )
}

function DashboardPage({
  stats,
  rankedIdeas,
  analyzedIdeas,
  selectedIdea,
  selectedAnalysis,
  onSelectIdea,
  onRunDeepAnalysis,
  isDeepAnalyzing,
}: {
  stats: {
    total: number
    analyzed: number
    highPotential: number
    needsReview: number
  }
  rankedIdeas: IdeaRow[]
  analyzedIdeas: Record<string, AnalyzedIdea>
  selectedIdea: IdeaRow | null
  selectedAnalysis?: AnalyzedIdea
  onSelectIdea: (idea: IdeaRow) => void
  onRunDeepAnalysis: () => void
  isDeepAnalyzing: boolean
}) {
  const topIdeas = rankedIdeas
    .filter((idea) => analyzedIdeas[getIdeaKey(idea)])
    .slice(0, 8)

  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Total Ideas" value={String(stats.total)} />
        <StatCard label="Analyzed" value={String(stats.analyzed)} />
        <StatCard label="High Potential" value={String(stats.highPotential)} />
        <StatCard label="Needs Review" value={String(stats.needsReview)} />
      </div>

      <div className="mt-8 grid grid-cols-[1fr_440px] gap-6">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-5">
            <h3 className="text-lg font-semibold">Top Ranked Ideas</h3>
            <p className="mt-1 text-sm text-gray-500">
              Best results from the current bulk screen.
            </p>
          </div>

          {topIdeas.length === 0 ? (
            <div className="p-6 text-sm text-gray-500">
              Run a bulk screen to see ranked ideas here.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {topIdeas.map((idea, index) => {
                const analysis = analyzedIdeas[getIdeaKey(idea)]

                return (
                  <button
                    key={getIdeaKey(idea)}
                    onClick={() => onSelectIdea(idea)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left hover:bg-gray-50"
                  >
                    <div>
                      <p className="text-xs font-medium text-gray-500">
                        #{index + 1}
                      </p>
                      <p className="mt-1 font-semibold">{idea.idea}</p>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                        {analysis?.recommendation}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-bold">
                        {analysis?.overallScore ?? '—'}
                      </p>
                      <p className="text-xs text-gray-500">score</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <IdeaDetail
          idea={selectedIdea}
          analysis={selectedAnalysis}
          onRunDeepAnalysis={onRunDeepAnalysis}
          isDeepAnalyzing={isDeepAnalyzing}
        />
      </div>
    </>
  )
}

function IdeasPage({
  ideas,
  analyzedIdeas,
  selectedIdea,
  onSelectIdea,
  onGoToDetail,
}: {
  ideas: IdeaRow[]
  analyzedIdeas: Record<string, AnalyzedIdea>
  selectedIdea: IdeaRow | null
  onSelectIdea: (idea: IdeaRow) => void
  onGoToDetail: () => void
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-200 p-5">
        <div>
          <h3 className="text-lg font-semibold">Ideas</h3>
          <p className="mt-1 text-sm text-gray-500">
            Sorted by DreamLens score when available.
          </p>
        </div>

        {selectedIdea && (
          <button
            onClick={onGoToDetail}
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Open Selected Detail
          </button>
        )}
      </div>

      <div className="max-h-[720px] overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="border-b border-gray-200 px-4 py-3">ID</th>
              <th className="border-b border-gray-200 px-4 py-3">Idea</th>
              <th className="border-b border-gray-200 px-4 py-3">Industry</th>
              <th className="border-b border-gray-200 px-4 py-3">Score</th>
              <th className="border-b border-gray-200 px-4 py-3">Confidence</th>
              <th className="border-b border-gray-200 px-4 py-3">Ethics</th>
              <th className="border-b border-gray-200 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {ideas.map((idea) => {
              const analysis = analyzedIdeas[getIdeaKey(idea)]
              const selected = selectedIdea && getIdeaKey(selectedIdea) === getIdeaKey(idea)

              return (
                <tr
                  key={getIdeaKey(idea)}
                  onClick={() => onSelectIdea(idea)}
                  className={`cursor-pointer border-b border-gray-100 hover:bg-gray-50 ${
                    selected ? 'bg-gray-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-gray-500">{idea.id}</td>
                  <td className="max-w-xl px-4 py-3 font-medium">
                    {idea.idea || 'Untitled idea'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {idea.industries.length > 0 ? idea.industries.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {analysis?.overallScore ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {analysis ? `${Math.round(analysis.confidence * 100)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {analysis?.scores.ethicsRisk ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={idea.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AgentsPage({
  ideas,
  analyzedCount,
  selectedIdea,
  selectedAnalysis,
  onRunBulk25,
  onRunBulk100,
  onRunDeepAnalysis,
  isBulkAnalyzing,
  isDeepAnalyzing,
}: {
  ideas: IdeaRow[]
  analyzedCount: number
  selectedIdea: IdeaRow | null
  selectedAnalysis?: AnalyzedIdea
  onRunBulk25: () => void
  onRunBulk100: () => void
  onRunDeepAnalysis: () => void
  isBulkAnalyzing: boolean
  isDeepAnalyzing: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_420px] gap-6">
      <div className="space-y-5">
        <AgentCard
          icon={<Search size={20} />}
          title="Bulk Screen Agent"
          status="Active"
          description="Fast, low-cost batch scoring. Good for screening many raw ideas before deep analysis."
          steps={[
            'Scores 10 ideas per LLM call',
            'Estimates pain, market size, WTP, MVP speed, margin, risk',
            'Returns concise recommendations',
          ]}
          actions={
            <div className="flex gap-3">
              <button
                disabled={ideas.length === 0 || isBulkAnalyzing}
                onClick={onRunBulk25}
                className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isBulkAnalyzing ? 'Running...' : 'Run Next 25'}
              </button>
              <button
                disabled={ideas.length === 0 || isBulkAnalyzing}
                onClick={onRunBulk100}
                className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Run Next 100
              </button>
            </div>
          }
        />

        <AgentCard
          icon={<Brain size={20} />}
          title="Deep Multi-Agent Workflow"
          status="Active"
          description="Slower, more detailed LangGraph workflow for selected high-potential ideas."
          steps={[
            'Idea Normalizer Agent',
            'Business Scoring Agent',
            'Risk + Competition Agent',
            'Final Synthesis Agent',
          ]}
          actions={
            <button
              disabled={!selectedIdea || isDeepAnalyzing}
              onClick={onRunDeepAnalysis}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDeepAnalyzing ? 'Running Deep Analysis...' : 'Run on Selected Idea'}
            </button>
          }
        />

        <AgentCard
          icon={<Sparkles size={20} />}
          title="Research Agents"
          status="Not built yet"
          description="The next major upgrade: real web research for competitors, pricing, market size, and evidence."
          steps={[
            'Market Sizing Agent',
            'Competitor Verification Agent',
            'Pricing Research Agent',
            'Evidence Checker Agent',
          ]}
        />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Run Status</h3>

        <div className="mt-5 space-y-4">
          <MiniStat label="Ideas loaded" value={ideas.length} />
          <MiniStat label="Ideas analyzed" value={analyzedCount} />
          <MiniStat
            label="Selected idea"
            value={selectedIdea?.idea || 'None selected'}
          />
          <MiniStat
            label="Selected score"
            value={selectedAnalysis?.overallScore ?? '—'}
          />
        </div>

        <div className="mt-6 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-600">
          Use bulk screening to rank many ideas quickly. Then click a promising idea in the Ideas tab and run deep analysis here.
        </div>
      </div>
    </div>
  )
}

function IdeaDetail({
  idea,
  analysis,
  onRunDeepAnalysis,
  isDeepAnalyzing,
}: {
  idea: IdeaRow | null
  analysis?: AnalyzedIdea
  onRunDeepAnalysis: () => void
  isDeepAnalyzing: boolean
}) {
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
    <div className="max-h-[760px] overflow-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-wide text-gray-500">
          Idea #{idea.id}
        </p>
        <h3 className="mt-1 text-xl font-bold">{idea.idea || 'Untitled idea'}</h3>
      </div>

      <button
        disabled={isDeepAnalyzing}
        onClick={onRunDeepAnalysis}
        className="mb-5 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isDeepAnalyzing ? 'Running Deep Analysis...' : 'Run Deep Analysis on This Idea'}
      </button>

      {analysis && (
        <div className="mb-5 rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">DreamLens Score</p>
              <p className="mt-1 text-4xl font-bold">{analysis.overallScore}</p>
            </div>
            <div className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600">
              Confidence: {Math.round(analysis.confidence * 100)}%
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-700">
            {analysis.recommendation}
          </p>
        </div>
      )}

      <DetailSection label="Description" value={idea.description} />
      <DetailSection label="Problem Being Solved" value={idea.problem} />
      <DetailSection label="Target Audience" value={idea.targetAudience} />
      <DetailSection label="Product Name" value={idea.productName} />
      <DetailSection label="Existing Competitors" value={idea.competitors} />

      {analysis && (
        <>
          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <h4 className="text-sm font-semibold">AI Scores</h4>
            <dl className="mt-3 space-y-2 text-sm">
              <ScoreRow label="Problem Pain" value={analysis.scores.problemPain} />
              <ScoreRow label="Willingness to Pay" value={analysis.scores.willingnessToPay} />
              <ScoreRow label="Market Size" value={analysis.scores.marketSize} />
              <ScoreRow label="Customer Reachability" value={analysis.scores.customerReachability} />
              <ScoreRow label="Founder Fit" value={analysis.scores.founderFit} />
              <ScoreRow label="Competitive Whitespace" value={analysis.scores.competitiveWhitespace} />
              <ScoreRow label="Speed to MVP" value={analysis.scores.speedToMvp} />
              <ScoreRow label="Gross Margin" value={analysis.scores.grossMargin} />
              <ScoreRow label="Ethics Risk" value={analysis.scores.ethicsRisk} />
            </dl>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold">Suggested Names</h4>
            <div className="mt-2 flex flex-wrap gap-2">
              {analysis.suggestedNames.map((name) => (
                <span
                  key={name}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold">Competitor Notes</h4>
            <div className="mt-2 space-y-3">
              {analysis.competitors.map((competitor) => (
                <div key={competitor.name} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-sm font-medium">{competitor.name}</p>
                  <p className="mt-1 text-sm text-gray-600">{competitor.moat}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5">
            <h4 className="text-sm font-semibold">Ethics Notes</h4>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
              {analysis.ethicsNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </div>
        </>
      )}

      {!analysis && (
        <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Run analysis to generate scores, competitor notes, ethics notes, and names.
        </div>
      )}
    </div>
  )
}

function SidebarButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium ${
        active
          ? 'bg-gray-100 text-gray-950'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

function AgentCard({
  icon,
  title,
  status,
  description,
  steps,
  actions,
}: {
  icon: React.ReactNode
  title: string
  status: string
  description: string
  steps: string[]
  actions?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gray-100 p-3">{icon}</div>
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>

        <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
          {status}
        </span>
      </div>

      <ul className="mt-5 space-y-2">
        {steps.map((step) => (
          <li key={step} className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle2 size={15} />
            {step}
          </li>
        ))}
      </ul>

      {actions && <div className="mt-5">{actions}</div>}
    </div>
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

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-gray-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-800">{value}</p>
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

function ScoreRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium">{value || '—'}</dd>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const label = status.replace('_', ' ')

  return (
    <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
      {label}
    </span>
  )
}

export default App
