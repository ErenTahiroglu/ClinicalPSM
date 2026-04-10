import { describe, it, expect } from 'vitest'
import { isCategoricalColumn, encodeData } from '../encoding'
import type { RawRow } from '../encoding'

// ---------------------------------------------------------------------------
// isCategoricalColumn
// ---------------------------------------------------------------------------

describe('isCategoricalColumn', () => {
  it('returns false when all values are numbers', () => {
    const rows: RawRow[] = [{ age: 40 }, { age: 55 }, { age: 30 }]
    expect(isCategoricalColumn(rows, 'age')).toBe(false)
  })

  it('returns false when values are numeric strings ("1", "2.5")', () => {
    const rows: RawRow[] = [{ score: '1' }, { score: '2.5' }, { score: '0' }]
    expect(isCategoricalColumn(rows, 'score')).toBe(false)
  })

  it('returns true when at least one value is a non-numeric string', () => {
    const rows: RawRow[] = [{ group: 'A' }, { group: 'B' }, { group: 'A' }]
    expect(isCategoricalColumn(rows, 'group')).toBe(true)
  })

  it('returns true when some values are non-numeric and others are null', () => {
    const rows: RawRow[] = [{ g: null }, { g: 'Control' }, { g: null }]
    expect(isCategoricalColumn(rows, 'g')).toBe(true)
  })

  it('returns false when all values are null or empty (treated as numeric)', () => {
    const rows: RawRow[] = [{ x: null }, { x: null }, { x: '' }]
    expect(isCategoricalColumn(rows, 'x')).toBe(false)
  })

  it('returns true when a single row has a non-numeric string', () => {
    const rows: RawRow[] = [{ v: 1 }, { v: 2 }, { v: 'outlier' }]
    expect(isCategoricalColumn(rows, 'v')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// encodeData
// ---------------------------------------------------------------------------

describe('encodeData', () => {
  // --- numeric-only --------------------------------------------------------

  it('pure numeric covariates: data unchanged, no dummy columns', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 50, bmi: 28 },
      { treatment: 0, age: 40, bmi: 24 },
    ]
    const { data, encodedColumns, numericColumns } = encodeData(rows, 'treatment', ['age', 'bmi'])

    expect(encodedColumns.size).toBe(0)
    expect(data[0].age).toBe(50)
    expect(data[1].bmi).toBe(24)
    expect(numericColumns).toContain('treatment')
    expect(numericColumns).toContain('age')
    expect(numericColumns).toContain('bmi')
  })

  it('numeric string values are coerced to numbers', () => {
    const rows: RawRow[] = [
      { treatment: '1', age: '45' },
      { treatment: '0', age: '55' },
    ] as unknown as RawRow[]
    const { data } = encodeData(rows, 'treatment', ['age'])
    expect(typeof data[0].treatment).toBe('number')
    expect(data[0].treatment).toBe(1)
    expect(typeof data[0].age).toBe('number')
    expect(data[0].age).toBe(45)
  })

  it('treatment column is always present in encoded data', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 50 },
      { treatment: 0, age: 40 },
    ]
    const { data } = encodeData(rows, 'treatment', ['age'])
    expect(data[0]).toHaveProperty('treatment', 1)
    expect(data[1]).toHaveProperty('treatment', 0)
  })

  // --- categorical encoding ------------------------------------------------

  it('categorical column with 2 unique values produces 1 dummy (k-1)', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'A' },
    ]
    const { encodedColumns } = encodeData(rows, 'treatment', ['group'])
    expect(encodedColumns.has('group')).toBe(true)
    expect(encodedColumns.get('group')!.length).toBe(1)
  })

  it('categorical column with 3 unique values produces 2 dummies (k-1)', () => {
    const rows: RawRow[] = [
      { treatment: 1, status: 'low' },
      { treatment: 0, status: 'mid' },
      { treatment: 1, status: 'high' },
      { treatment: 0, status: 'low' },
    ]
    const { encodedColumns } = encodeData(rows, 'treatment', ['status'])
    expect(encodedColumns.get('status')!.length).toBe(2)
  })

  it('dummy values are exactly 0 or 1', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
    ]
    const { data, encodedColumns } = encodeData(rows, 'treatment', ['group'])
    const dummies = encodedColumns.get('group')!
    for (const row of data) {
      for (const d of dummies) {
        expect([0, 1]).toContain(row[d])
      }
    }
  })

  it('reference category (first alphabetically) gets all-zero dummies', () => {
    // unique values sorted: ['A','B','C'] — 'A' is dropped (reference)
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
    ]
    const { data, encodedColumns } = encodeData(rows, 'treatment', ['group'])
    const dummies = encodedColumns.get('group')! // ['group_B', 'group_C']
    const refRow = data[0] // group = 'A' → all zeros
    for (const d of dummies) {
      expect(refRow[d]).toBe(0)
    }
  })

  it('non-reference categories have exactly one 1 in their dummy', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
    ]
    const { data, encodedColumns } = encodeData(rows, 'treatment', ['group'])
    // group_B should be 1 only for the row where group='B'
    const groupBCol = encodedColumns.get('group')!.find(d => d.endsWith('_B'))!
    expect(data[0][groupBCol]).toBe(0) // A
    expect(data[1][groupBCol]).toBe(1) // B
    expect(data[2][groupBCol]).toBe(0) // C
  })

  it('numericColumns includes treatment, numeric covariates, and all dummies', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 50, group: 'A' },
      { treatment: 0, age: 40, group: 'B' },
    ]
    const { numericColumns, encodedColumns } = encodeData(rows, 'treatment', ['age', 'group'])
    const dummies = encodedColumns.get('group')!
    expect(numericColumns).toContain('treatment')
    expect(numericColumns).toContain('age')
    for (const d of dummies) {
      expect(numericColumns).toContain(d)
    }
    // Original categorical column name should NOT appear
    expect(numericColumns).not.toContain('group')
  })

  it('mixed numeric + categorical covariates both encoded correctly', () => {
    const rows: RawRow[] = [
      { t: 1, age: 50, sex: 'M' },
      { t: 0, age: 40, sex: 'F' },
      { t: 1, age: 45, sex: 'M' },
    ]
    const { data, encodedColumns } = encodeData(rows, 't', ['age', 'sex'])
    // age stays as-is
    expect(data[0].age).toBe(50)
    // sex encoded: ['F', 'M'] → drop 'F', keep 'sex_M'
    expect(encodedColumns.has('sex')).toBe(true)
    const dummies = encodedColumns.get('sex')!
    expect(dummies).toHaveLength(1)
  })

  it('empty covariates array returns only treatment column', () => {
    const rows: RawRow[] = [{ treatment: 1 }, { treatment: 0 }]
    const { data, encodedColumns, numericColumns } = encodeData(rows, 'treatment', [])
    expect(encodedColumns.size).toBe(0)
    expect(numericColumns).toEqual(['treatment'])
    expect(Object.keys(data[0])).toEqual(['treatment'])
  })

  it('filters out string "null" and "undefined" values when collecting unique category values', () => {
    // Rows where the category cell stringifies to 'null' or 'undefined' should be
    // treated as missing and excluded from the unique-values set (not become dummy columns)
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: null },   // stringifies to 'null' → filtered out
      { treatment: 1, group: undefined }, // stringifies to 'undefined' → filtered out
      { treatment: 0, group: 'B' },
    ] as unknown as RawRow[]
    const { encodedColumns } = encodeData(rows, 'treatment', ['group'])
    // Only 'A' and 'B' are real categories → 1 dummy (k-1)
    const dummies = encodedColumns.get('group')!
    expect(dummies).toHaveLength(1)
    // No dummy for 'null' or 'undefined' strings
    expect(dummies.every(d => !d.includes('null') && !d.includes('undefined'))).toBe(true)
  })
})
