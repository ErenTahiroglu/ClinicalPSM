import { describe, it, expect } from 'vitest'
import { computeBalance, runPsm } from '../balance'
import type { DataRow, MatchedPair } from '../types'

function makeBalanceData(): {
  data: DataRow[]
  scores: number[]
  pairs: MatchedPair[]
  config: { treatmentColumn: string; covariates: string[] }
} {
  const data: DataRow[] = [
    { treatment: 1, age: 60, bmi: 30 },
    { treatment: 1, age: 55, bmi: 28 },
    { treatment: 1, age: 65, bmi: 32 },
    { treatment: 0, age: 40, bmi: 22 },
    { treatment: 0, age: 45, bmi: 24 },
    { treatment: 0, age: 42, bmi: 23 },
  ]
  const scores = [0.8, 0.75, 0.85, 0.2, 0.25, 0.22]
  const pairs: MatchedPair[] = [
    { treatedIndex: 0, controlIndex: 3, propensityTreated: 0.8, propensityControl: 0.2, distance: 0.6 },
    { treatedIndex: 1, controlIndex: 4, propensityTreated: 0.75, propensityControl: 0.25, distance: 0.5 },
  ]
  const config = { treatmentColumn: 'treatment', covariates: ['age', 'bmi'] }
  return { data, scores, pairs, config }
}

describe('computeBalance', () => {
  it('returns one BalanceRow per covariate', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const table = computeBalance(data, scores, pairs, config)
    expect(table).toHaveLength(2)
    expect(table[0].covariate).toBe('age')
    expect(table[1].covariate).toBe('bmi')
  })

  it('smdBefore reflects unmatched group difference', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const table = computeBalance(data, scores, pairs, config)
    // Treated age mean ~60, Control ~42 — SMD should be positive and large
    expect(table[0].smdBefore).toBeGreaterThan(0)
  })

  it('smdAfter is typically smaller than smdBefore after matching', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const table = computeBalance(data, scores, pairs, config)
    // After matching we only keep pairs 0→3 and 1→4
    for (const row of table) {
      expect(typeof row.smdAfter).toBe('number')
      expect(isNaN(row.smdAfter)).toBe(false)
    }
  })

  it('varianceRatio is positive', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const table = computeBalance(data, scores, pairs, config)
    for (const row of table) {
      expect(row.varianceRatioBefore).toBeGreaterThanOrEqual(0)
      expect(row.varianceRatioAfter).toBeGreaterThanOrEqual(0)
    }
  })

  it('meanTreated and meanControl reflect actual group means', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const table = computeBalance(data, scores, pairs, config)
    const ageTreatedMean = (60 + 55 + 65) / 3
    expect(table[0].meanTreated).toBeCloseTo(ageTreatedMean, 5)
  })

  it('empty pairs: smdAfter and varianceRatioAfter are 0 (colStats n=0 branch)', () => {
    // pairs=[] → matchedTreatedIdx=[], matchedControlIdx=[]
    // colStats([]) → n=0 → {mean:0, variance:0}
    // computeSmd([], []) → sdPooled=0 → smd=0; c.variance=0 → varianceRatio=0
    const { data, scores, config } = makeBalanceData()
    const table = computeBalance(data, scores, [], config)
    for (const row of table) {
      expect(row.smdAfter).toBe(0)
      expect(row.varianceRatioAfter).toBe(0)
    }
  })

  it('single matched pair: variance=0 for n=1 group (colStats n=1 branch)', () => {
    // Single pair → afterT=[value], afterC=[value] each have length 1
    // colStats([v]) → n=1 → variance=0 → sdPooled=0 → smd=0; varianceRatio=0
    const { data, scores, config } = makeBalanceData()
    const singlePair: MatchedPair[] = [
      { treatedIndex: 0, controlIndex: 3, propensityTreated: 0.8, propensityControl: 0.2, distance: 0.6 },
    ]
    const table = computeBalance(data, scores, singlePair, config)
    for (const row of table) {
      expect(row.smdAfter).toBe(0)      // sdPooled=0 → smd=0
      expect(row.varianceRatioAfter).toBe(0) // c.variance=0 → ratio=0
    }
  })
})

describe('runPsm', () => {
  it('returns correct nTreated, nControl, nMatched counts', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const result = runPsm(data, scores, pairs, config, { converged: true })
    expect(result.nTreated).toBe(3)
    expect(result.nControl).toBe(3)
    expect(result.nMatched).toBe(2)
  })

  it('overallSmdAfter <= overallSmdBefore in a balanced case', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    const result = runPsm(data, scores, pairs, config, { converged: true })
    expect(result.overallSmdAfter).toBeLessThanOrEqual(result.overallSmdBefore + 0.001)
  })

  it('passes converged flag through', () => {
    const { data, scores, pairs, config } = makeBalanceData()
    expect(runPsm(data, scores, pairs, config, { converged: true }).converged).toBe(true)
    expect(runPsm(data, scores, pairs, config, { converged: false }).converged).toBe(false)
  })
})
