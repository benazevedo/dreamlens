import type { IdeaRow } from '../types/idea'

export type IdeaScores = {
  problemPain: number
  willingnessToPay: number
  marketSize: number
  customerReachability: number
  founderFit: number
  competitiveWhitespace: number
  speedToMvp: number
  grossMargin: number
  ethicsRisk: number
}

export type AnalyzedIdea = {
  id: string
  rowNumber: number
  idea: string
  summary: string
  problemBeingSolved: string
  targetCustomers: string[]
  industries: string[]
  scores: IdeaScores
  overallScore: number
  confidence: number
  estimatedPriceRange: string
  competitors: {
    name: string
    moat: string
  }[]
  ethicsNotes: string[]
  suggestedNames: string[]
  recommendation: string
  status: string
}

export type ProblemClusterInput = {
  key: string
  id: string
  rowNumber: number
  idea: string
  problemBeingSolved: string
  targetCustomers: string[]
  industries: string[]
  overallScore?: number
  recommendation?: string
}

export type ProblemCluster = {
  clusterId: string
  title: string
  problemStatement: string
  primaryCustomer: string
  industries: string[]
  ideaKeys: string[]
  productSuiteStrategy: string
  whyTheseBelongTogether: string
  suggestedCompanyNames: string[]
  opportunityScore: number
  confidence: number
}

const API_BASE_URL = 'http://localhost:8000'

export async function runBulkAiScreen(
  ideas: IdeaRow[],
  limit = 25,
): Promise<AnalyzedIdea[]> {
  const response = await fetch(`${API_BASE_URL}/analyze/bulk-ai-screen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ideas, limit }),
  })

  if (!response.ok) {
    throw new Error(`Bulk AI screen failed: ${response.status}`)
  }

  return response.json()
}

export async function runDeepAiScreen(
  ideas: IdeaRow[],
  limit = 1,
): Promise<AnalyzedIdea[]> {
  const response = await fetch(`${API_BASE_URL}/analyze/ai-screen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ideas, limit }),
  })

  if (!response.ok) {
    throw new Error(`Deep AI screen failed: ${response.status}`)
  }

  return response.json()
}

export async function clusterProblemOpportunities(
  items: ProblemClusterInput[],
  limit = 100,
): Promise<ProblemCluster[]> {
  const response = await fetch(`${API_BASE_URL}/analyze/problem-clusters`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ items, limit }),
  })

  if (!response.ok) {
    throw new Error(`Problem clustering failed: ${response.status}`)
  }

  return response.json()
}

export type CustomerDiscoveryPlan = {
  primary_customer: string
  customer_segments: string[]
  pain_hypotheses: string[]
  where_to_find_customers: string[]
  interview_questions: string[]
  strongest_buying_trigger: string
}

export type MVPPlan = {
  mvp_summary: string
  must_have_features: string[]
  explicitly_not_in_mvp: string[]
  fastest_build_path: string
  estimated_build_time: string
  riskiest_assumption: string
}

export type GTMExperimentPlan = {
  positioning_statement: string
  landing_page_headline: string
  landing_page_subheadline: string
  acquisition_channels: string[]
  validation_experiments: string[]
  pricing_tests: string[]
  success_metrics: string[]
  kill_criteria: string[]
}

export type ValidationPlan = {
  key: string
  idea: string
  problem_being_solved: string
  customer_discovery: CustomerDiscoveryPlan
  mvp_plan: MVPPlan
  gtm_experiment_plan: GTMExperimentPlan
  first_7_days: string[]
  first_30_days: string[]
  founder_warning: string
  validation_score: number
  confidence: number
}

export type ValidationIdeaInput = {
  key: string
  id: string
  rowNumber: number
  idea: string
  description?: string
  problemBeingSolved: string
  targetCustomers: string[]
  industries: string[]
  overallScore?: number
  recommendation?: string
}

export async function createValidationPlan(
  idea: ValidationIdeaInput,
): Promise<ValidationPlan> {
  const response = await fetch(`${API_BASE_URL}/analyze/validation-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idea }),
  })

  if (!response.ok) {
    throw new Error(`Validation plan failed: ${response.status}`)
  }

  return response.json()
}


export type ResearchSource = {
  title: string
  url: string
  content: string
}

export type ResearchBrief = {
  key: string
  idea: string
  problem_being_solved: string

  competitor_summary: string
  competitors: string[]
  competitor_moats: string[]

  pricing_summary: string
  likely_price_range: string
  willingness_to_pay_notes: string[]

  market_summary: string
  market_evidence: string[]

  risks_and_unknowns: string[]
  recommended_next_research_steps: string[]

  evidence_quality: string
  confidence: number
  sources: ResearchSource[]
}

export type ResearchIdeaInput = {
  key: string
  id: string
  rowNumber: number
  idea: string
  description?: string
  problemBeingSolved: string
  targetCustomers: string[]
  industries: string[]
  overallScore?: number
  recommendation?: string
}

export async function createResearchBrief(
  idea: ResearchIdeaInput,
): Promise<ResearchBrief> {
  const response = await fetch(`${API_BASE_URL}/analyze/research-brief`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idea }),
  })

  if (!response.ok) {
    throw new Error(`Research brief failed: ${response.status}`)
  }

  return response.json()
}

export type DecisionMemo = {
  key: string
  idea_name: string
  decision: 'Pursue' | 'Validate' | 'Park' | 'Kill'
  decision_score: number
  confidence: number

  thesis: string
  why_now: string
  strongest_evidence: string[]
  weakest_evidence: string[]

  best_first_wedge: string
  ideal_customer_profile: string
  likely_business_model: string
  recommended_price_test: string

  biggest_risks: string[]
  kill_criteria: string[]
  next_7_days: string[]
  next_30_days: string[]

  product_suite_potential: string
  founder_note: string
}

export type DecisionMemoInput = {
  key: string
  idea: Record<string, unknown>
  analysis?: Record<string, unknown>
  validationPlan?: Record<string, unknown>
  researchBrief?: Record<string, unknown>
}

export async function createDecisionMemo(
  input: DecisionMemoInput,
): Promise<DecisionMemo> {
  const response = await fetch(`${API_BASE_URL}/analyze/decision-memo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input }),
  })

  if (!response.ok) {
    throw new Error(`Decision memo failed: ${response.status}`)
  }

  return response.json()
}


export type AtomicIdea = {
  title: string
  description: string
  problem_being_solved: string
  target_customer: string
  product_type: string
  why_this_should_be_separate: string
  initial_score_hint: number
}

export type IdeaDecomposition = {
  original_idea_summary: string
  is_compound_idea: boolean
  atomic_ideas: AtomicIdea[]
  shared_problem_themes: string[]
  recommended_company_thesis: string
  recommended_first_wedge: string
  should_evaluate_separately: boolean
  ethics_or_legal_flags: string[]
  decomposition_confidence: number
}

export type IdeaDecompositionInput = {
  id: string
  rowNumber: number
  idea: string
  description?: string
  problem?: string
}

export async function decomposeIdea(
  idea: IdeaDecompositionInput,
): Promise<IdeaDecomposition> {
  const response = await fetch(`${API_BASE_URL}/analyze/decompose-idea`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ idea }),
  })

  if (!response.ok) {
    throw new Error(`Idea decomposition failed: ${response.status}`)
  }

  return response.json()
}
