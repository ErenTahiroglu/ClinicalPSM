import { describe, it, expect } from 'vitest'
import { detectMissingValues, imputeData } from '../imputation'
import type { RawRow } from '../encoding'

// ---------------------------------------------------------------------------
// detectMissingValues
// ---------------------------------------------------------------------------

describe('detectMissingValues', () => {
  it('returns empty array when no values are missing', () => {
    const rows: RawRow[] = [{ age: 40, bmi: 25 }, { age: 55, bmi: 30 }]
    expect(detectMissingValues(rows, ['age', 'bmi'])).toHaveLength(0)
  })

  it('detects null as missing', () => {
    const rows: RawRow[] = [{ age: null }, { age: 50 }]
    const result = detectMissingValues(rows, ['age'])
    expect(result).toHaveLength(1)
    expect(result[0].missingCount).toBe(1)
  })

  it('detects empty string as missing', () => {
    const rows: RawRow[] = [{ age: '' as unknown as null }, { age: 50 }]
    const result = detectMissingValues(rows, ['age'])
    expect(result[0].missingCount).toBe(1)
  })

  it('detects NaN as missing', () => {
    const rows: RawRow[] = [{ age: NaN }, { age: 45 }]
    const result = detectMissingValues(rows, ['age'])
    expect(result[0].missingCount).toBe(1)
  })

  it('counts multiple missing values per column', () => {
    const rows: RawRow[] = [
      { age: null }, { age: null }, { age: 50 }, { age: null },
    ]
    const result = detectMissingValues(rows, ['age'])
    expect(result[0].missingCount).toBe(3)
    expect(result[0].totalCount).toBe(4)
  })

  it('only returns columns that have at least one missing value', () => {
    const rows: RawRow[] = [{ age: null, bmi: 25 }, { age: 50, bmi: 30 }]
    const result = detectMissingValues(rows, ['age', 'bmi'])
    expect(result).toHaveLength(1)
    expect(result[0].column).toBe('age')
  })

  it('reports correct missing counts for multiple columns', () => {
    const rows: RawRow[] = [
      { a: null, b: null },
      { a: 1,    b: null },
      { a: 2,    b: 3 },
    ]
    const result = detectMissingValues(rows, ['a', 'b'])
    const aEntry = result.find(r => r.column === 'a')!
    const bEntry = result.find(r => r.column === 'b')!
    expect(aEntry.missingCount).toBe(1)
    expect(bEntry.missingCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// imputeData — mean
// ---------------------------------------------------------------------------

describe('imputeData — mean', () => {
  it('fills null values with the column mean', () => {
    const rows: RawRow[] = [
      { age: null },
      { age: 10 },
      { age: 20 },
    ]
    const result = imputeData(rows, ['age'], 'mean')
    // mean of [10, 20] = 15
    expect(result[0].age).toBe(15)
  })

  it('does not change non-missing values', () => {
    const rows: RawRow[] = [{ age: null }, { age: 50 }]
    const result = imputeData(rows, ['age'], 'mean')
    expect(result[1].age).toBe(50)
  })

  it('imputes multiple columns simultaneously', () => {
    const rows: RawRow[] = [
      { age: null, bmi: null },
      { age: 40,   bmi: 20 },
      { age: 60,   bmi: 30 },
    ]
    const result = imputeData(rows, ['age', 'bmi'], 'mean')
    expect(result[0].age).toBe(50) // (40+60)/2
    expect(result[0].bmi).toBe(25) // (20+30)/2
  })

  it('returns original rows unchanged when there are no missing values', () => {
    const rows: RawRow[] = [{ age: 40 }, { age: 50 }]
    const result = imputeData(rows, ['age'], 'mean')
    expect(result[0].age).toBe(40)
    expect(result[1].age).toBe(50)
  })

  it('leaves nulls unchanged when ALL values in a mean/median column are null (vals.length=0 branch)', () => {
    // numericValues returns [] → vals.length===0 → continue → fillValues NOT set
    const rows: RawRow[] = [{ age: null }, { age: null }]
    const result = imputeData(rows, ['age'], 'mean')
    expect(result[0].age).toBeNull()
    expect(result[1].age).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// imputeData — median
// ---------------------------------------------------------------------------

describe('imputeData — median', () => {
  it('fills null with median for an odd-count array', () => {
    const rows: RawRow[] = [
      { v: null },
      { v: 10 },
      { v: 20 },
      { v: 30 },
    ]
    const result = imputeData(rows, ['v'], 'median')
    // non-null values: [10, 20, 30] — median = 20
    expect(result[0].v).toBe(20)
  })

  it('fills null with median for an even-count array (avg of two middle)', () => {
    const rows: RawRow[] = [
      { v: null },
      { v: 10 },
      { v: 20 },
      { v: 30 },
      { v: 40 },
    ]
    const result = imputeData(rows, ['v'], 'median')
    // non-null: [10,20,30,40] — median = (20+30)/2 = 25
    expect(result[0].v).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// imputeData — mode
// ---------------------------------------------------------------------------

describe('imputeData — mode', () => {
  it('fills null with the most frequent numeric value', () => {
    const rows: RawRow[] = [
      { v: null },
      { v: 1 },
      { v: 2 },
      { v: 2 },
      { v: 3 },
    ]
    const result = imputeData(rows, ['v'], 'mode')
    expect(result[0].v).toBe(2)
  })

  it('fills null in a categorical column with the most frequent string', () => {
    const rows: RawRow[] = [
      { group: null },
      { group: 'A' },
      { group: 'B' },
      { group: 'B' },
      { group: 'C' },
    ]
    const result = imputeData(rows, ['group'], 'mode')
    expect(result[0].group).toBe('B')
  })

  it('does not change non-missing values', () => {
    const rows: RawRow[] = [{ v: null }, { v: 5 }, { v: 5 }]
    const result = imputeData(rows, ['v'], 'mode')
    expect(result[1].v).toBe(5)
    expect(result[2].v).toBe(5)
  })

  it('leaves nulls unchanged when ALL values in a mode column are null', () => {
    // nonNull.length === 0 → fillValues NOT set → nulls stay null
    const rows: RawRow[] = [{ v: null }, { v: null }]
    const result = imputeData(rows, ['v'], 'mode')
    expect(result[0].v).toBeNull()
    expect(result[1].v).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// imputeData — drop
// ---------------------------------------------------------------------------

describe('imputeData — drop', () => {
  it('removes rows with null in specified columns', () => {
    const rows: RawRow[] = [
      { age: null, bmi: 25 },
      { age: 50,   bmi: 30 },
    ]
    const result = imputeData(rows, ['age', 'bmi'], 'drop')
    expect(result).toHaveLength(1)
    expect(result[0].age).toBe(50)
  })

  it('keeps rows where all specified columns are present', () => {
    const rows: RawRow[] = [
      { age: 40, bmi: 25 },
      { age: 50, bmi: 30 },
    ]
    const result = imputeData(rows, ['age', 'bmi'], 'drop')
    expect(result).toHaveLength(2)
  })

  it('drops row if ANY of the specified columns is missing', () => {
    const rows: RawRow[] = [
      { age: 40, bmi: null },
      { age: null, bmi: 25 },
      { age: 50, bmi: 30 },
    ]
    const result = imputeData(rows, ['age', 'bmi'], 'drop')
    expect(result).toHaveLength(1)
    expect(result[0].age).toBe(50)
  })

  it('returns empty array when all rows have missing values', () => {
    const rows: RawRow[] = [{ age: null }, { age: null }]
    const result = imputeData(rows, ['age'], 'drop')
    expect(result).toHaveLength(0)
  })
})
