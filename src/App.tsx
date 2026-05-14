import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  Brain,
  CheckCircle2,
  Database,
  Play,
  Search,
  Sparkles,
  Upload,
  Download,
  Network,
} from 'lucide-react'
import { parseIdeasCsv } from './lib/parseIdeasCsv'
import { exportIdeasCsv } from './lib/exportIdeasCsv'
import {
  runBulkAiScreen,
  runDeepAiScreen,
  clusterProblemOpportunities,
  createValidationPlan,
  createResearchBrief,
  type AnalyzedIdea,
  type ProblemCluster,
  type ValidationPlan,
  type ResearchBrief,
} from './api/dreamlensApi'
import type { IdeaRow } from './types/idea'

type Page = 'dashboard' | 'ideas' | 'problems' | 'agents'

const STORAGE_KEY = 'dreamlens.session.v1'

function getIdeaKey(idea: Pick<IdeaRow, 'id' | 'rowNumber'>) {
  return `${idea.id}-${idea.rowNumber}`
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [ideas, setIdeas] = useState<IdeaRow[]>([])
  const [selectedIdea, setSelectedIdea] = useState<IdeaRow | null>(null)
  const [analyzedIdeas, setAnalyzedIdeas] = useState<Record<string, AnalyzedIdea>>({})
  const [problemClusters, setProblemClusters] = useState<ProblemCluster[]>([])
  const [validationPlans, setValidationPlans] = useState<Record<string, ValidationPlan>>({})
  const [researchBriefs, setResearchBriefs] = useState<Record<string, ResearchBrief>>({})
  const [isProblemClustering, setIsProblemClustering] = useState(false)
  const [isValidationPlanning, setIsValidationPlanning] = useState(false)
  const [isResearching, setIsResearching] = useState(false)
  const [isParsing, setIsParsing] = useState(false)
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false)
  const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    try {
      const savedSession = localStorage.getItem(STORAGE_KEY)

      if (!savedSession) {
        setHasHydrated(true)
        return
      }

      const parsed = JSON.parse(savedSession) as {
        ideas?: IdeaRow[]
        analyzedIdeas?: Record<string, AnalyzedIdea>
        problemClusters?: ProblemCluster[]
        validationPlans?: Record<string, ValidationPlan>
        researchBriefs?: Record<string, ResearchBrief>
        selectedIdeaKey?: string | null
        page?: Page
      }

      const restoredIdeas = parsed.ideas ?? []
      const restoredAnalyzedIdeas = parsed.analyzedIdeas ?? {}
      const restoredProblemClusters = parsed.problemClusters ?? []
      const restoredValidationPlans = parsed.validationPlans ?? {}
      const restoredResearchBriefs = parsed.researchBriefs ?? {}

      setIdeas(restoredIdeas)
      setAnalyzedIdeas(restoredAnalyzedIdeas)
      setProblemClusters(restoredProblemClusters)
      setValidationPlans(restoredValidationPlans)
      setResearchBriefs(restoredResearchBriefs)
      setPage(parsed.page ?? 'dashboard')

      if (parsed.selectedIdeaKey) {
        const restoredSelectedIdea = restoredIdeas.find(
          (idea) => getIdeaKey(idea) === parsed.selectedIdeaKey,
        )

        setSelectedIdea(restoredSelectedIdea ?? restoredIdeas[0] ?? null)
      } else {
        setSelectedIdea(restoredIdeas[0] ?? null)
      }
    } catch (err) {
      console.error('Failed to restore DreamLens session:', err)
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setHasHydrated(true)
    }
  }, [])

  useEffect(() => {
    if (!hasHydrated) return

    const selectedIdeaKey = selectedIdea ? getIdeaKey(selectedIdea) : null

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ideas,
        analyzedIdeas,
        problemClusters,
        validationPlans,
        researchBriefs,
        selectedIdeaKey,
        page,
      }),
    )
  }, [
    hasHydrated,
    ideas,
    analyzedIdeas,
    problemClusters,
    validationPlans,
    researchBriefs,
    selectedIdea,
    page,
  ])

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

  function handleClearSession() {
    localStorage.removeItem(STORAGE_KEY)
    setIdeas([])
    setSelectedIdea(null)
    setAnalyzedIdeas({})
    setProblemClusters([])
    setValidationPlans({})
    setResearchBriefs({})
    setError(null)
    setPage('dashboard')
  }

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

  async function handleRunProblemClustering() {
    const items = ideas
      .map((idea) => {
        const analysis = analyzedIdeas[getIdeaKey(idea)]

        if (!analysis) return null

        const problemBeingSolved = idea.problem || analysis.problemBeingSolved

        if (!problemBeingSolved) return null

        return {
          key: getIdeaKey(idea),
          id: idea.id,
          rowNumber: idea.rowNumber,
          idea: idea.idea,
          problemBeingSolved,
          targetCustomers: idea.targetAudience
            ? [idea.targetAudience]
            : analysis.targetCustomers,
          industries:
            idea.industries.length > 0 ? idea.industries : analysis.industries,
          overallScore: analysis.overallScore,
          recommendation: analysis.recommendation,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)

    if (items.length === 0) {
      setError('Run analysis on some ideas before clustering problems.')
      return
    }

    setIsProblemClustering(true)
    setError(null)

    try {
      const clusters = await clusterProblemOpportunities(items, 100)
      setProblemClusters(clusters)
      setPage('problems')
    } catch (err) {
      console.error(err)
      setError('Problem clustering failed. Check the backend terminal for details.')
    } finally {
      setIsProblemClustering(false)
    }
  }

  async function handleCreateValidationPlan() {
    if (!selectedIdea) {
      setError('Select an idea before creating a validation plan.')
      return
    }

    const key = getIdeaKey(selectedIdea)
    const analysis = analyzedIdeas[key]

    const problemBeingSolved =
      selectedIdea.problem ||
      analysis?.problemBeingSolved ||
      selectedIdea.description ||
      selectedIdea.idea

    setIsValidationPlanning(true)
    setError(null)

    try {
      const plan = await createValidationPlan({
        key,
        id: selectedIdea.id,
        rowNumber: selectedIdea.rowNumber,
        idea: selectedIdea.idea,
        description: selectedIdea.description,
        problemBeingSolved,
        targetCustomers: selectedIdea.targetAudience
          ? [selectedIdea.targetAudience]
          : analysis?.targetCustomers ?? [],
        industries:
          selectedIdea.industries.length > 0
            ? selectedIdea.industries
            : analysis?.industries ?? [],
        overallScore: analysis?.overallScore,
        recommendation: analysis?.recommendation,
      })

      setValidationPlans((current) => ({
        ...current,
        [key]: plan,
      }))

      setPage('dashboard')
    } catch (err) {
      console.error(err)
      setError('Validation plan failed. Check the backend terminal for details.')
    } finally {
      setIsValidationPlanning(false)
    }
  }

  async function handleCreateResearchBrief() {
    if (!selectedIdea) {
      setError('Select an idea before creating a research brief.')
      return
    }

    const key = getIdeaKey(selectedIdea)
    const analysis = analyzedIdeas[key]

    const problemBeingSolved =
      selectedIdea.problem ||
      analysis?.problemBeingSolved ||
      selectedIdea.description ||
      selectedIdea.idea

    setIsResearching(true)
    setError(null)

    try {
      const brief = await createResearchBrief({
        key,
        id: selectedIdea.id,
        rowNumber: selectedIdea.rowNumber,
        idea: selectedIdea.idea,
        description: selectedIdea.description,
        problemBeingSolved,
        targetCustomers: selectedIdea.targetAudience
          ? [selectedIdea.targetAudience]
          : analysis?.targetCustomers ?? [],
        industries:
          selectedIdea.industries.length > 0
            ? selectedIdea.industries
            : analysis?.industries ?? [],
        overallScore: analysis?.overallScore,
        recommendation: analysis?.recommendation,
      })

      setResearchBriefs((current) => ({
        ...current,
        [key]: brief,
      }))

      setPage('dashboard')
    } catch (err) {
      console.error(err)
      setError('Research brief failed. Check the backend terminal for details.')
    } finally {
      setIsResearching(false)
    }
  }

  function handleExportCsv() {
    if (ideas.length === 0) return
    exportIdeasCsv(ideas, analyzedIdeas)
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
            active={page === 'problems'}
            icon={<Network size={18} />}
            label="Problems"
            onClick={() => setPage('problems')}
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
          canExport={ideas.length > 0}
          onExportCsv={handleExportCsv}
          onClearSession={handleClearSession}
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
            selectedValidationPlan={
              selectedIdea ? validationPlans[getIdeaKey(selectedIdea)] : undefined
            }
            onCreateValidationPlan={handleCreateValidationPlan}
            isValidationPlanning={isValidationPlanning}
            selectedResearchBrief={
              selectedIdea ? researchBriefs[getIdeaKey(selectedIdea)] : undefined
            }
            onCreateResearchBrief={handleCreateResearchBrief}
            isResearching={isResearching}
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

        {page === 'problems' && (
          <ProblemsPage
            clusters={problemClusters}
            ideas={ideas}
            analyzedIdeas={analyzedIdeas}
            onRunProblemClustering={handleRunProblemClustering}
            isProblemClustering={isProblemClustering}
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
            onRunProblemClustering={handleRunProblemClustering}
            isProblemClustering={isProblemClustering}
            onCreateValidationPlan={handleCreateValidationPlan}
            isValidationPlanning={isValidationPlanning}
            onCreateResearchBrief={handleCreateResearchBrief}
            isResearching={isResearching}
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
  canExport,
  onExportCsv,
  onClearSession,
}: {
  isParsing: boolean
  onFileUpload: (file: File | undefined) => void
  onRunBulkAnalysis: () => void
  isBulkAnalyzing: boolean
  hasIdeas: boolean
  canExport: boolean
  onExportCsv: () => void
  onClearSession: () => void
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
          disabled={!canExport}
          onClick={onExportCsv}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={16} />
          Export CSV
        </button>

        <button
          disabled={!hasIdeas}
          onClick={onClearSession}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear Session
        </button>

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
  selectedValidationPlan,
  onCreateValidationPlan,
  isValidationPlanning,
  selectedResearchBrief,
  onCreateResearchBrief,
  isResearching,
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
  selectedValidationPlan?: ValidationPlan
  onCreateValidationPlan: () => void
  isValidationPlanning: boolean
  selectedResearchBrief?: ResearchBrief
  onCreateResearchBrief: () => void
  isResearching: boolean
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
          validationPlan={selectedValidationPlan}
          onCreateValidationPlan={onCreateValidationPlan}
          isValidationPlanning={isValidationPlanning}
          researchBrief={selectedResearchBrief}
          onCreateResearchBrief={onCreateResearchBrief}
          isResearching={isResearching}
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
  const [query, setQuery] = useState('')
  const [minScore, setMinScore] = useState('all')
  const [maxEthicsRisk, setMaxEthicsRisk] = useState('all')

  const filteredIdeas = useMemo(() => {
    const search = query.trim().toLowerCase()

    return ideas.filter((idea) => {
      const analysis = analyzedIdeas[getIdeaKey(idea)]
      const finalIndustries =
        idea.industries.length > 0 ? idea.industries : analysis?.industries ?? []
      const finalTargetAudience =
        idea.targetAudience || analysis?.targetCustomers.join(', ') || ''

      const searchableText = [
        idea.id,
        idea.idea,
        idea.description,
        idea.problem,
        analysis?.problemBeingSolved,
        finalTargetAudience,
        finalIndustries.join(', '),
        analysis?.recommendation,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      const matchesQuery = !search || searchableText.includes(search)

      const score = analysis?.overallScore
      const matchesScore =
        minScore === 'all' || (typeof score === 'number' && score >= Number(minScore))

      const ethicsRisk = analysis?.scores.ethicsRisk
      const matchesEthics =
        maxEthicsRisk === 'all' ||
        (typeof ethicsRisk === 'number' && ethicsRisk <= Number(maxEthicsRisk))

      return matchesQuery && matchesScore && matchesEthics
    })
  }, [ideas, analyzedIdeas, query, minScore, maxEthicsRisk])

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Ideas</h3>
            <p className="mt-1 text-sm text-gray-500">
              Sorted by DreamLens score. AI-inferred industries are shown when the original sheet is blank.
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

        <div className="mt-5 grid grid-cols-[1fr_180px_180px] gap-3">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search ideas, industries, customers, problems..."
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400"
          />

          <select
            value={minScore}
            onChange={(event) => setMinScore(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400"
          >
            <option value="all">Any score</option>
            <option value="50">Score 50+</option>
            <option value="60">Score 60+</option>
            <option value="70">Score 70+</option>
            <option value="80">Score 80+</option>
          </select>

          <select
            value={maxEthicsRisk}
            onChange={(event) => setMaxEthicsRisk(event.target.value)}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm outline-none focus:border-gray-400"
          >
            <option value="all">Any ethics risk</option>
            <option value="1">Ethics risk ≤ 1</option>
            <option value="2">Ethics risk ≤ 2</option>
            <option value="3">Ethics risk ≤ 3</option>
            <option value="4">Ethics risk ≤ 4</option>
          </select>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Showing {filteredIdeas.length} of {ideas.length} ideas.
        </p>
      </div>

      <div className="max-h-[720px] overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="border-b border-gray-200 px-4 py-3">ID</th>
              <th className="border-b border-gray-200 px-4 py-3">Idea</th>
              <th className="border-b border-gray-200 px-4 py-3">Problem</th>
              <th className="border-b border-gray-200 px-4 py-3">Industry</th>
              <th className="border-b border-gray-200 px-4 py-3">Target Audience</th>
              <th className="border-b border-gray-200 px-4 py-3">Score</th>
              <th className="border-b border-gray-200 px-4 py-3">Confidence</th>
              <th className="border-b border-gray-200 px-4 py-3">Ethics</th>
              <th className="border-b border-gray-200 px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredIdeas.map((idea) => {
              const analysis = analyzedIdeas[getIdeaKey(idea)]
              const selected =
                selectedIdea && getIdeaKey(selectedIdea) === getIdeaKey(idea)

              const finalProblem =
                idea.problem || analysis?.problemBeingSolved || ''

              const finalIndustries =
                idea.industries.length > 0 ? idea.industries : analysis?.industries ?? []

              const finalTargetAudience =
                idea.targetAudience || analysis?.targetCustomers.join(', ') || ''

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
                  <td className="max-w-xs px-4 py-3 text-gray-500">
                    {finalProblem || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {finalIndustries.length > 0 ? finalIndustries.join(', ') : '—'}
                  </td>
                  <td className="max-w-xs px-4 py-3 text-gray-500">
                    {finalTargetAudience || '—'}
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


function ProblemsPage({
  clusters,
  ideas,
  analyzedIdeas,
  onRunProblemClustering,
  isProblemClustering,
  onSelectIdea,
  onGoToDetail,
}: {
  clusters: ProblemCluster[]
  ideas: IdeaRow[]
  analyzedIdeas: Record<string, AnalyzedIdea>
  onRunProblemClustering: () => void
  isProblemClustering: boolean
  onSelectIdea: (idea: IdeaRow) => void
  onGoToDetail: () => void
}) {
  const ideaByKey = useMemo(() => {
    return ideas.reduce<Record<string, IdeaRow>>((acc, idea) => {
      acc[getIdeaKey(idea)] = idea
      return acc
    }, {})
  }, [ideas])

  const sortedClusters = useMemo(() => {
    return [...clusters].sort((a, b) => b.opportunityScore - a.opportunityScore)
  }, [clusters])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h3 className="text-lg font-semibold">Problem Opportunities</h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-gray-500">
              This agent groups analyzed ideas by the underlying customer problem. 
              A cluster can represent a company thesis, with the ideas acting as product lines, wedges, or features.
            </p>
          </div>

          <button
            disabled={Object.keys(analyzedIdeas).length === 0 || isProblemClustering}
            onClick={onRunProblemClustering}
            className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProblemClustering ? 'Clustering...' : 'Cluster Problems'}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4">
          <MiniStat label="Analyzed ideas" value={Object.keys(analyzedIdeas).length} />
          <MiniStat label="Problem clusters" value={clusters.length} />
          <MiniStat
            label="Best cluster score"
            value={clusters.length ? Math.max(...clusters.map((cluster) => cluster.opportunityScore)) : '—'}
          />
        </div>
      </div>

      {sortedClusters.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-sm text-gray-500 shadow-sm">
          Run bulk analysis first, then click Cluster Problems.
        </div>
      ) : (
        <div className="space-y-5">
          {sortedClusters.map((cluster, index) => {
            const clusterIdeas = cluster.ideaKeys
              .map((key) => ideaByKey[key])
              .filter(Boolean)

            return (
              <div
                key={cluster.clusterId}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      Problem Cluster #{index + 1}
                    </p>
                    <h3 className="mt-1 text-xl font-bold">{cluster.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-700">
                      {cluster.problemStatement}
                    </p>
                  </div>

                  <div className="min-w-24 rounded-2xl bg-gray-50 p-4 text-center">
                    <p className="text-3xl font-bold">{cluster.opportunityScore}</p>
                    <p className="text-xs text-gray-500">opportunity</p>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-4">
                  <MiniStat label="Primary customer" value={cluster.primaryCustomer} />
                  <MiniStat label="Ideas in cluster" value={cluster.ideaKeys.length} />
                  <MiniStat
                    label="Confidence"
                    value={`${Math.round(cluster.confidence * 100)}%`}
                  />
                </div>

                <div className="mt-5 rounded-xl bg-gray-50 p-4">
                  <h4 className="text-sm font-semibold">Company/Product Suite Strategy</h4>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {cluster.productSuiteStrategy}
                  </p>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-semibold">Why These Belong Together</h4>
                  <p className="mt-2 text-sm leading-6 text-gray-600">
                    {cluster.whyTheseBelongTogether}
                  </p>
                </div>

                <div className="mt-5">
                  <h4 className="text-sm font-semibold">Possible Company Names</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {cluster.suggestedCompanyNames.map((name) => (
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
                  <h4 className="text-sm font-semibold">Products / Ideas in This Cluster</h4>
                  <div className="mt-3 divide-y divide-gray-100 rounded-xl border border-gray-200">
                    {clusterIdeas.map((idea) => {
                      const analysis = analyzedIdeas[getIdeaKey(idea)]

                      return (
                        <button
                          key={getIdeaKey(idea)}
                          onClick={() => {
                            onSelectIdea(idea)
                            onGoToDetail()
                          }}
                          className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-gray-50"
                        >
                          <div>
                            <p className="font-medium">{idea.idea}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                              {idea.problem || analysis?.problemBeingSolved}
                            </p>
                          </div>

                          <div className="text-right">
                            <p className="text-lg font-bold">
                              {analysis?.overallScore ?? '—'}
                            </p>
                            <p className="text-xs text-gray-500">idea score</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
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
  onRunProblemClustering,
  isProblemClustering,
  onCreateValidationPlan,
  isValidationPlanning,
  onCreateResearchBrief,
  isResearching,
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
  onRunProblemClustering: () => void
  isProblemClustering: boolean
  onCreateValidationPlan: () => void
  isValidationPlanning: boolean
  onCreateResearchBrief: () => void
  isResearching: boolean
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
          title="Validation Agents"
          status="Active"
          description="Turns a selected idea into a concrete validation plan with customer discovery, MVP, and GTM experiments."
          steps={[
            'Customer Discovery Agent',
            'MVP Planning Agent',
            'GTM / Experiment Agent',
            '7-day and 30-day validation roadmap',
          ]}
          actions={
            <button
              disabled={!selectedIdea || isValidationPlanning}
              onClick={onCreateValidationPlan}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isValidationPlanning ? 'Creating Plan...' : 'Run on Selected Idea'}
            </button>
          }
        />

        <AgentCard
          icon={<Network size={20} />}
          title="Problem Clustering Agent"
          status="Active"
          description="Groups analyzed ideas by shared customer problems so you can spot company/product-suite opportunities."
          steps={[
            'Finds similar underlying problems',
            'Groups related product ideas',
            'Suggests company theses and names',
            'Scores the opportunity of each cluster',
          ]}
          actions={
            <button
              disabled={analyzedCount === 0 || isProblemClustering}
              onClick={onRunProblemClustering}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isProblemClustering ? 'Clustering...' : 'Cluster Problems'}
            </button>
          }
        />

        <AgentCard
          icon={<Search size={20} />}
          title="Research Agents"
          status="Active"
          description="Runs live web research for competitors, pricing, market evidence, and risks."
          steps={[
            'Competitor Research Agent',
            'Pricing / WTP Research Agent',
            'Market Evidence Agent',
            'Evidence Summary Agent with sources',
          ]}
          actions={
            <button
              disabled={!selectedIdea || isResearching}
              onClick={onCreateResearchBrief}
              className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isResearching ? 'Researching...' : 'Run on Selected Idea'}
            </button>
          }
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
          Use bulk screening to rank many ideas quickly. Then select a promising idea and run deep analysis, validation, and research.
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
  validationPlan,
  onCreateValidationPlan,
  isValidationPlanning,
  researchBrief,
  onCreateResearchBrief,
  isResearching,
}: {
  idea: IdeaRow | null
  analysis?: AnalyzedIdea
  onRunDeepAnalysis: () => void
  isDeepAnalyzing: boolean
  validationPlan?: ValidationPlan
  onCreateValidationPlan: () => void
  isValidationPlanning: boolean
  researchBrief?: ResearchBrief
  onCreateResearchBrief: () => void
  isResearching: boolean
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

      <div className="mb-5 grid grid-cols-1 gap-3">
        <button
          disabled={isDeepAnalyzing}
          onClick={onRunDeepAnalysis}
          className="rounded-xl bg-gray-950 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isDeepAnalyzing ? 'Running Deep Analysis...' : 'Run Deep Analysis'}
        </button>

        <div className="grid grid-cols-2 gap-3">
          <button
            disabled={isValidationPlanning}
            onClick={onCreateValidationPlan}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isValidationPlanning ? 'Creating Plan...' : 'Run Validation Plan'}
          </button>

          <button
            disabled={isResearching}
            onClick={onCreateResearchBrief}
            className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isResearching ? 'Researching...' : 'Run Research Brief'}
          </button>
        </div>
      </div>

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
      <DetailSection
        label="Problem Being Solved"
        value={idea.problem || analysis?.problemBeingSolved}
      />
      <DetailSection
        label="Target Audience"
        value={idea.targetAudience || analysis?.targetCustomers.join(', ')}
      />
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

      {researchBrief && <ResearchBriefPanel brief={researchBrief} />}
      {validationPlan && <ValidationPlanPanel plan={validationPlan} />}

      {!analysis && (
        <div className="mt-5 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Run analysis to generate scores, competitor notes, ethics notes, and names.
        </div>
      )}
    </div>
  )
}

function ResearchBriefPanel({ brief }: { brief: ResearchBrief }) {
  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold">Research Brief</h4>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            Evidence quality: {brief.evidence_quality}
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 text-center">
          <p className="text-2xl font-bold">
            {Math.round(brief.confidence * 100)}%
          </p>
          <p className="text-xs text-gray-500">confidence</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <ResearchSection title="Competitor Summary" body={brief.competitor_summary} />
        <ResearchList title="Competitors" items={brief.competitors} />
        <ResearchList title="Competitor Moats" items={brief.competitor_moats} />

        <ResearchSection title="Pricing Summary" body={brief.pricing_summary} />
        <ResearchSection title="Likely Price Range" body={brief.likely_price_range} />
        <ResearchList
          title="Willingness-to-Pay Notes"
          items={brief.willingness_to_pay_notes}
        />

        <ResearchSection title="Market Summary" body={brief.market_summary} />
        <ResearchList title="Market Evidence" items={brief.market_evidence} />

        <ResearchList title="Risks and Unknowns" items={brief.risks_and_unknowns} />
        <ResearchList
          title="Next Research Steps"
          items={brief.recommended_next_research_steps}
        />

        <div>
          <h5 className="text-sm font-semibold">Sources</h5>
          <div className="mt-2 space-y-3">
            {brief.sources.map((source) => (
              <a
                key={source.url}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-xl border border-gray-200 p-3 hover:bg-gray-50"
              >
                <p className="text-sm font-medium">{source.title}</p>
                <p className="mt-1 break-all text-xs text-gray-500">{source.url}</p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-gray-600">
                  {source.content}
                </p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ResearchSection({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div>
      <h5 className="text-sm font-semibold">{title}</h5>
      <p className="mt-2 text-sm leading-6 text-gray-600">{body}</p>
    </div>
  )
}

function ResearchList({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div>
      <h5 className="text-sm font-semibold">{title}</h5>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}


function ValidationPlanPanel({ plan }: { plan: ValidationPlan }) {
  return (
    <div className="mt-5 rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold">Validation Plan</h4>
          <p className="mt-1 text-sm leading-6 text-gray-600">
            {plan.problem_being_solved}
          </p>
        </div>

        <div className="rounded-xl bg-gray-50 p-3 text-center">
          <p className="text-2xl font-bold">{plan.validation_score}</p>
          <p className="text-xs text-gray-500">validation</p>
        </div>
      </div>

      <div className="mt-5 space-y-5">
        <ValidationSection
          title="Primary Customer"
          items={[
            plan.customer_discovery.primary_customer,
            `Buying trigger: ${plan.customer_discovery.strongest_buying_trigger}`,
          ]}
        />

        <ValidationSection
          title="Where to Find Customers"
          items={plan.customer_discovery.where_to_find_customers}
        />

        <ValidationSection
          title="Interview Questions"
          items={plan.customer_discovery.interview_questions}
        />

        <ValidationSection
          title="MVP Plan"
          items={[
            plan.mvp_plan.mvp_summary,
            `Fastest build path: ${plan.mvp_plan.fastest_build_path}`,
            `Estimated build time: ${plan.mvp_plan.estimated_build_time}`,
            `Riskiest assumption: ${plan.mvp_plan.riskiest_assumption}`,
          ]}
        />

        <ValidationSection
          title="Must-Have MVP Features"
          items={plan.mvp_plan.must_have_features}
        />

        <ValidationSection
          title="GTM Experiments"
          items={plan.gtm_experiment_plan.validation_experiments}
        />

        <ValidationSection
          title="Pricing Tests"
          items={plan.gtm_experiment_plan.pricing_tests}
        />

        <ValidationSection title="First 7 Days" items={plan.first_7_days} />
        <ValidationSection title="First 30 Days" items={plan.first_30_days} />

        <div className="rounded-xl bg-gray-50 p-4">
          <h5 className="text-sm font-semibold">Founder Warning</h5>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            {plan.founder_warning}
          </p>
        </div>
      </div>
    </div>
  )
}

function ValidationSection({
  title,
  items,
}: {
  title: string
  items: string[]
}) {
  return (
    <div>
      <h5 className="text-sm font-semibold">{title}</h5>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-6 text-gray-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
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
