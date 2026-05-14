import type { AnalyzedIdea } from '../api/dreamlensApi'
import type { IdeaRow } from '../types/idea'

function getIdeaKey(idea: Pick<IdeaRow, 'id' | 'rowNumber'>) {
  return `${idea.id}-${idea.rowNumber}`
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return ''

  const stringValue = String(value)

  if (
    stringValue.includes(',') ||
    stringValue.includes('"') ||
    stringValue.includes('\n') ||
    stringValue.includes('\r')
  ) {
    return `"${stringValue.replaceAll('"', '""')}"`
  }

  return stringValue
}

function joinList(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(' | ') : ''
}

function formatCompetitors(analysis?: AnalyzedIdea): string {
  if (!analysis) return ''

  return analysis.competitors
    .map((competitor) => `${competitor.name}: ${competitor.moat}`)
    .join(' | ')
}

export function exportIdeasCsv(
  ideas: IdeaRow[],
  analyzedIdeas: Record<string, AnalyzedIdea>,
) {
  const headers = [
    'id',
    'row_number',
    'date',
    'idea',
    'description',
    'problem',
    'original_target_audience',
    'original_product_name',
    'original_competitors',
    'original_industries',
    'status',

    'dreamlens_score',
    'confidence',
    'summary',
    'recommendation',
    'estimated_price_range',

    'problem_pain',
    'willingness_to_pay',
    'market_size',
    'customer_reachability',
    'founder_fit',
    'competitive_whitespace',
    'speed_to_mvp',
    'gross_margin',
    'ethics_risk',

    'ai_target_customers',
    'ai_industries',
    'ai_competitors',
    'ethics_notes',
    'suggested_names',
  ]

  const rows = ideas.map((idea) => {
    const analysis = analyzedIdeas[getIdeaKey(idea)]

    return [
      idea.id,
      idea.rowNumber,
      idea.date,
      idea.idea,
      idea.description,
      idea.problem,
      idea.targetAudience,
      idea.productName,
      idea.competitors,
      joinList(idea.industries),
      idea.status,

      analysis?.overallScore,
      analysis ? Math.round(analysis.confidence * 100) + '%' : '',
      analysis?.summary,
      analysis?.recommendation,
      analysis?.estimatedPriceRange,

      analysis?.scores.problemPain,
      analysis?.scores.willingnessToPay,
      analysis?.scores.marketSize,
      analysis?.scores.customerReachability,
      analysis?.scores.founderFit,
      analysis?.scores.competitiveWhitespace,
      analysis?.scores.speedToMvp,
      analysis?.scores.grossMargin,
      analysis?.scores.ethicsRisk,

      joinList(analysis?.targetCustomers),
      joinList(analysis?.industries),
      formatCompetitors(analysis),
      joinList(analysis?.ethicsNotes),
      joinList(analysis?.suggestedNames),
    ]
  })

  const csv = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const date = new Date().toISOString().slice(0, 10)

  link.href = url
  link.download = `dreamlens-export-${date}.csv`
  link.click()

  URL.revokeObjectURL(url)
}
