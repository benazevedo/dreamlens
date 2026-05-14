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

const API_BASE_URL = 'http://localhost:8000'

export async function runFastScreen(ideas: IdeaRow[]): Promise<AnalyzedIdea[]> {
  const response = await fetch(`${API_BASE_URL}/analyze/fast-screen`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ideas }),
  })

  if (!response.ok) {
    throw new Error(`Fast screen failed: ${response.status}`)
  }

  return response.json()
}
