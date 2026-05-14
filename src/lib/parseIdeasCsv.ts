import Papa from 'papaparse'
import type { IdeaRow } from '../types/idea'

const INDUSTRY_COLUMNS: Record<number, string> = {
  22: 'Agricultural/Food',
  23: 'Automotive',
  24: 'Clothing',
  25: 'Construction',
  26: 'Education',
  27: 'Energy',
  28: 'Environmental',
  29: 'Health',
  30: 'Infrastructure',
  31: 'Medical',
  32: 'News',
  33: 'Novelty',
  34: 'Security',
  35: 'World Economy',
}

function cell(row: unknown[], index: number): string {
  const value = row[index]
  return typeof value === 'string' ? value.trim() : ''
}

function isMarked(value: string): boolean {
  const normalized = value.toLowerCase()
  return ['x', 'yes', 'true', '1', 'y'].includes(normalized)
}

function getIndustries(row: unknown[]): string[] {
  return Object.entries(INDUSTRY_COLUMNS)
    .filter(([index]) => isMarked(cell(row, Number(index))))
    .map(([, industry]) => industry)
}

export function parseIdeasCsv(file: File): Promise<IdeaRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<unknown[]>(file, {
      header: false,
      skipEmptyLines: false,
      complete: (result) => {
        const rows = result.data

        const ideas = rows
          // Your real idea rows start after the blank/title/header rows.
          .slice(3)
          .map((row, index): IdeaRow => {
            const rowNumber = index + 4
            const id = cell(row, 0) || `row-${rowNumber}`

            return {
              id,
              rowNumber,
              rawRating: cell(row, 1),
              date: cell(row, 2),
              idea: cell(row, 3),
              description: cell(row, 4),
              problem: cell(row, 5),

              problemSeverity: cell(row, 6),
              willingnessToPay: cell(row, 7),
              marketSize: cell(row, 8),
              audienceClarity: cell(row, 9),
              founderIdeaFit: cell(row, 10),
              competitiveWhitespace: cell(row, 11),
              speedToMvp: cell(row, 12),

              targetAudience: cell(row, 13),
              productName: cell(row, 14),
              competitors: cell(row, 15),
              ethicsRisk: cell(row, 17),

              industries: getIndustries(row),
              status: 'not_started',
            }
          })
          .filter((idea) => {
            return idea.idea || idea.description || idea.problem
          })

        resolve(ideas)
      },
      error: (error) => {
        reject(error)
      },
    })
  })
}
