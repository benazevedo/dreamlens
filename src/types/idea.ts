export type IdeaStatus =
  | 'not_started'
  | 'running'
  | 'completed'
  | 'needs_review'
  | 'failed'

export type IdeaRow = {
  id: string
  rowNumber: number
  rawRating?: string
  date?: string
  idea: string
  description?: string
  problem?: string

  problemSeverity?: string
  willingnessToPay?: string
  marketSize?: string
  audienceClarity?: string
  founderIdeaFit?: string
  competitiveWhitespace?: string
  speedToMvp?: string

  targetAudience?: string
  productName?: string
  competitors?: string
  ethicsRisk?: string

  industries: string[]
  status: IdeaStatus
}
