import type { RawRow } from './encoding'

export type ImputationStrategy = 'mean' | 'median' | 'mode' | 'drop'

export interface MissingValueSummary {
  column: string
  missingCount: number
  totalCount: number
}

/** Returns columns that have at least one missing value */
export function detectMissingValues(rows: RawRow[], columns: string[]): MissingValueSummary[] {
  return columns
    .map(col => {
      const missingCount = rows.filter(r => {
        const v = r[col]
        return v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))
      }).length
      return { column: col, missingCount, totalCount: rows.length }
    })
    .filter(s => s.missingCount > 0)
}

function numericValues(rows: RawRow[], col: string): number[] {
  return rows
    .map(r => r[col])
    .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(Number(v)))
    .map(Number)
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function mode(values: (number | string)[]): number | string {
  const freq = new Map<number | string, number>()
  for (const v of values) {
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  let best: number | string = 0
  let bestCount = 0
  for (const [val, count] of freq) {
    if (count > bestCount) { bestCount = count; best = val }
  }
  return best
}

/**
 * Applies the chosen imputation strategy to the specified columns.
 * 'drop' removes rows with any missing value in those columns.
 */
export function imputeData(
  rows: RawRow[],
  columns: string[],
  strategy: ImputationStrategy
): RawRow[] {
  if (strategy === 'drop') {
    return rows.filter(row =>
      columns.every(col => {
        const v = row[col]
        if (v === null || v === undefined || v === '') return false
        if (typeof v === 'number' && isNaN(v)) return false
        return true
      })
    )
  }

  const fillValues = new Map<string, number | string>()
  for (const col of columns) {
    if (strategy === 'mode') {
      // mode works on any type (numeric or categorical) — skip the numeric-only guard
      const rawVals = rows.map(r => r[col])
      const nonNull = rawVals.filter((v): v is string | number => v !== null && v !== undefined && v !== '')
      if (nonNull.length > 0) fillValues.set(col, mode(nonNull))
    } else {
      const vals = numericValues(rows, col)
      if (vals.length === 0) continue
      if (strategy === 'mean') fillValues.set(col, mean(vals))
      else fillValues.set(col, median(vals)) // only 'median' reaches here
    }
  }

  return rows.map(row => {
    const updated = { ...row }
    for (const col of columns) {
      const v = row[col]
      const isMissing = v === null || v === undefined || v === '' || (typeof v === 'number' && isNaN(v))
      if (isMissing && fillValues.has(col)) {
        updated[col] = fillValues.get(col)!
      }
    }
    return updated
  })
}
