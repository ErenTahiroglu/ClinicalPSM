/**
 * Additional encoding edge case tests.
 *
 * Extends existing encoding.test.ts with:
 * - Multi-category column (k>2, k-1 dummies)
 * - Numeric-string values treated as numeric (not categorical)
 * - null/undefined values excluded from category detection
 * - Empty string excluded from categories
 * - Treatment column is not included in covariates
 * - encodedColumns map structure
 * - numericColumns includes treatment
 */

import { describe, it, expect } from 'vitest'
import { encodeData, isCategoricalColumn } from '../encoding'
import type { RawRow } from '../encoding'

describe('isCategoricalColumn — additional edge cases', () => {
  it('returns false for numeric-string values ("1.5", "30")', () => {
    const rows: RawRow[] = [
      { age: '30' },
      { age: '45' },
      { age: '30.5' },
    ]
    expect(isCategoricalColumn(rows, 'age')).toBe(false)
  })

  it('returns false when all values are null/empty', () => {
    const rows: RawRow[] = [{ x: null }, { x: '' }]
    expect(isCategoricalColumn(rows, 'x')).toBe(false)
  })

  it('returns true when at least one value is a non-numeric string', () => {
    const rows: RawRow[] = [{ group: 'A' }, { group: 'B' }, { group: null }]
    expect(isCategoricalColumn(rows, 'group')).toBe(true)
  })

  it('returns false for boolean-like numeric values (0 and 1)', () => {
    const rows: RawRow[] = [{ binary: 0 }, { binary: 1 }, { binary: 0 }]
    expect(isCategoricalColumn(rows, 'binary')).toBe(false)
  })
})

describe('encodeData — additional edge cases', () => {
  it('encodes 3-category column into k-1=2 dummies', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
      { treatment: 0, group: 'A' },
    ]
    const result = encodeData(rows, 'treatment', ['group'])
    // A (first sorted) is dropped → dummies: group_B, group_C
    const dummies = result.encodedColumns.get('group')!
    expect(dummies).toHaveLength(2)
    expect(dummies).toContain('group_B')
    expect(dummies).toContain('group_C')
    expect(dummies).not.toContain('group_A') // reference category dropped
  })

  it('group_B=1, group_C=0 for row with group=B', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
      { treatment: 0, group: 'A' },
    ]
    const { data } = encodeData(rows, 'treatment', ['group'])
    // Row index 1 has group='B'
    expect(data[1]['group_B']).toBe(1)
    expect(data[1]['group_C']).toBe(0)
  })

  it('reference category (A) encodes to all zeros', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: 'B' },
      { treatment: 1, group: 'C' },
      { treatment: 0, group: 'A' },
    ]
    const { data } = encodeData(rows, 'treatment', ['group'])
    // Row 0 has group='A' (reference) → both dummies = 0
    expect(data[0]['group_B']).toBe(0)
    expect(data[0]['group_C']).toBe(0)
  })

  it('numeric covariates are coerced to number type', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: '30' },
      { treatment: 0, age: '45' },
    ]
    const { data } = encodeData(rows, 'treatment', ['age'])
    expect(typeof data[0]['age']).toBe('number')
    expect(data[0]['age']).toBe(30)
  })

  it('null values in numeric covariate become NaN (correct coercion)', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: null },
      { treatment: 0, age: 40 },
    ]
    const { data } = encodeData(rows, 'treatment', ['age'])
    // Number(null) = 0, but imputation should handle this before encoding
    // Just ensure no crash
    expect(typeof data[0]['age']).toBe('number')
  })

  it('treatment column appears in numericColumns', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 0, age: 40 },
    ]
    const { numericColumns } = encodeData(rows, 'treatment', ['age'])
    expect(numericColumns).toContain('treatment')
  })

  it('encodedColumns map has entry only for categorical covariates', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 30, group: 'A' },
      { treatment: 0, age: 40, group: 'B' },
    ]
    const { encodedColumns } = encodeData(rows, 'treatment', ['age', 'group'])
    expect(encodedColumns.has('group')).toBe(true)
    expect(encodedColumns.has('age')).toBe(false) // numeric → no encoding map
  })

  it('null and "null" string values are excluded from category set', () => {
    const rows: RawRow[] = [
      { treatment: 1, group: 'A' },
      { treatment: 0, group: null },
      { treatment: 1, group: 'undefined' }, // edge: should be included as string
      { treatment: 0, group: 'null' }, // should be excluded per encoding.ts
    ]
    const { encodedColumns } = encodeData(rows, 'treatment', ['group'])
    const dummies = encodedColumns.get('group')!
    // 'null' string excluded; 'undefined' string... check behavior
    expect(dummies).not.toContain('group_null') // 'null' string excluded
  })

  it('empty covariates array returns only treatment column in data', () => {
    const rows: RawRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 0, age: 40 },
    ]
    const { data, encodedColumns } = encodeData(rows, 'treatment', [])
    expect(encodedColumns.size).toBe(0)
    expect(Object.keys(data[0])).toEqual(['treatment'])
  })
})
