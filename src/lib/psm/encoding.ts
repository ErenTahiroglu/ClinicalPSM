import type { DataRow } from './types'

export type RawRow = Record<string, number | string | null>

export interface EncodingResult {
  data: DataRow[]
  /** Maps original categorical column names to their generated dummy column names */
  encodedColumns: Map<string, string[]>
  /** Final numeric column names (originals + dummies, excluding dropped columns) */
  numericColumns: string[]
}

/**
 * Determines whether a column is categorical (contains non-numeric values).
 * Numeric-looking strings ("0", "1.5") are treated as numeric.
 */
export function isCategoricalColumn(rows: RawRow[], col: string): boolean {
  for (const row of rows) {
    const val = row[col]
    if (val === null || val === undefined || val === '') continue
    if (typeof val === 'string' && isNaN(Number(val))) return true
  }
  return false
}

/**
 * One-hot encodes categorical columns in the covariate list.
 * For each categorical column with k unique values, creates k-1 dummy columns
 * (drops the first category to avoid multicollinearity).
 * Numeric columns are coerced to number.
 */
export function encodeData(
  rows: RawRow[],
  treatmentColumn: string,
  covariates: string[]
): EncodingResult {
  const encodedColumns = new Map<string, string[]>()
  const numericCovariates: string[] = []

  // Pass 1: classify each covariate
  const categoricalCols = covariates.filter(col => isCategoricalColumn(rows, col))
  const numericCols = covariates.filter(col => !isCategoricalColumn(rows, col))

  // Pass 2: collect unique values for each categorical column
  const uniqueValues = new Map<string, string[]>()
  for (const col of categoricalCols) {
    const vals = [...new Set(
      rows.map(r => String(r[col] ?? '')).filter(v => v !== '' && v !== 'null' && v !== 'undefined')
    )].sort()
    uniqueValues.set(col, vals)
    // k-1 dummies (drop first category)
    const dummies = vals.slice(1).map(v => `${col}_${v}`)
    encodedColumns.set(col, dummies)
    numericCovariates.push(...dummies)
  }

  // Numeric covariates stay as-is
  numericCovariates.push(...numericCols)

  // Pass 3: build encoded DataRow[]
  const data: DataRow[] = rows.map(row => {
    const encoded: DataRow = {
      [treatmentColumn]: Number(row[treatmentColumn]),
    }

    // Numeric covariates
    for (const col of numericCols) {
      encoded[col] = Number(row[col])
    }

    // Dummy variables
    for (const col of categoricalCols) {
      const vals = uniqueValues.get(col)!
      const rowVal = String(row[col] ?? '')
      for (const v of vals.slice(1)) {
        encoded[`${col}_${v}`] = rowVal === v ? 1 : 0
      }
    }

    return encoded
  })

  return {
    data,
    encodedColumns,
    numericColumns: [treatmentColumn, ...numericCovariates],
  }
}
