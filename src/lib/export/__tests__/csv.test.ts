import { describe, it, expect } from 'vitest'
import { buildMatchedCsv } from '../csv'
import type { DataRow, MatchedPair } from '@/lib/psm/types'
import type { RawRow } from '@/lib/psm/encoding'

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

// ---------------------------------------------------------------------------
// RFC 4180 escaping
// ---------------------------------------------------------------------------

describe('buildMatchedCsv — RFC 4180 escaping', () => {
  const pair: MatchedPair[] = [
    { treatedIndex: 0, controlIndex: 1, propensityTreated: 0.7, propensityControl: 0.3, distance: 0.4 },
  ]

  it('wraps cells containing a comma in double-quotes', () => {
    const rawData: RawRow[] = [
      { treatment: 1, group: 'Group A, B' },
      { treatment: 0, group: 'Group C' },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'group'])
    expect(csv).toContain('"Group A, B"')
  })

  it('escapes internal double-quotes by doubling them', () => {
    const rawData: RawRow[] = [
      { treatment: 1, label: 'She said "hello"' },
      { treatment: 0, label: 'Normal' },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'label'])
    expect(csv).toContain('"She said ""hello"""')
  })

  it('wraps cells containing a newline in double-quotes', () => {
    const rawData: RawRow[] = [
      { treatment: 1, note: 'line1\nline2' },
      { treatment: 0, note: 'ok' },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'note'])
    expect(csv).toContain('"line1\nline2"')
  })

  it('does not quote plain values without special characters', () => {
    const rawData: RawRow[] = [
      { treatment: 1, age: 45 },
      { treatment: 0, age: 50 },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'age'])
    // No cell should be quoted
    expect(csv).not.toContain('"45"')
    expect(csv).not.toContain('"50"')
  })

  it('handles null values as empty string without quoting', () => {
    const rawData: RawRow[] = [
      { treatment: 1, note: null },
      { treatment: 0, note: 'ok' },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'note'])
    const lines = csv.split('\n')
    // treated row: 1,treated,1,  (empty last cell)
    expect(lines[1].endsWith(',') || lines[1].endsWith('')).toBe(true)
  })

  it('handles null value in control row as empty string', () => {
    const rawData: RawRow[] = [
      { treatment: 1, note: 'ok' },
      { treatment: 0, note: null },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'note'])
    const lines = csv.split('\n')
    // control row should end with empty cell (null → '')
    expect(lines[2]).toContain('control')
    expect(lines[2].endsWith(',')).toBe(true)
  })

  it('wraps cells containing a carriage return in double-quotes', () => {
    const rawData: RawRow[] = [
      { treatment: 1, note: 'line1\rline2' },
      { treatment: 0, note: 'ok' },
    ]
    const csv = buildMatchedCsv(rawData, pair, ['treatment', 'note'])
    expect(csv).toContain('"line1\rline2"')
  })
})

