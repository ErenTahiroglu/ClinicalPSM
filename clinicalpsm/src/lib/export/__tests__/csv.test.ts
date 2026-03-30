import { describe, it, expect } from 'vitest'
import { buildMatchedCsv } from '../csv'
import type { DataRow, MatchedPair } from '@/lib/psm/types'

const data: DataRow[] = [
  { treatment: 1, age: 60, bmi: 30 },
  { treatment: 1, age: 55, bmi: 28 },
  { treatment: 0, age: 40, bmi: 22 },
  { treatment: 0, age: 45, bmi: 24 },
]

const pairs: MatchedPair[] = [
  { treatedIndex: 0, controlIndex: 2, propensityTreated: 0.8, propensityControl: 0.2, distance: 0.6 },
  { treatedIndex: 1, controlIndex: 3, propensityTreated: 0.75, propensityControl: 0.25, distance: 0.5 },
]

const columns = ['treatment', 'age', 'bmi']

describe('buildMatchedCsv', () => {
  it('starts with the correct header', () => {
    const csv = buildMatchedCsv(data, pairs, columns)
    const firstLine = csv.split('\n')[0]
    expect(firstLine).toBe('_matched_pair_id,_role,treatment,age,bmi')
  })

  it('produces 2 rows per pair (treated + control)', () => {
    const csv = buildMatchedCsv(data, pairs, columns)
    const lines = csv.split('\n')
    // header + 2 pairs × 2 rows = 5 lines
    expect(lines).toHaveLength(5)
  })

  it('assigns correct pair IDs', () => {
    const csv = buildMatchedCsv(data, pairs, columns)
    const lines = csv.split('\n')
    expect(lines[1].startsWith('1,')).toBe(true)
    expect(lines[2].startsWith('1,')).toBe(true)
    expect(lines[3].startsWith('2,')).toBe(true)
    expect(lines[4].startsWith('2,')).toBe(true)
  })

  it('marks treated and control roles correctly', () => {
    const csv = buildMatchedCsv(data, pairs, columns)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('treated')
    expect(lines[2]).toContain('control')
  })

  it('includes correct data values', () => {
    const csv = buildMatchedCsv(data, pairs, columns)
    // First treated row: data[0] = { treatment:1, age:60, bmi:30 }
    expect(csv).toContain('1,treated,1,60,30')
    // First control row: data[2] = { treatment:0, age:40, bmi:22 }
    expect(csv).toContain('1,control,0,40,22')
  })

  it('returns empty body for empty pairs', () => {
    const csv = buildMatchedCsv(data, [], columns)
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
    expect(lines[0]).toBe('_matched_pair_id,_role,treatment,age,bmi')
  })
})
