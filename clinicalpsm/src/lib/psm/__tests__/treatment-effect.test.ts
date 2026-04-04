import { describe, it, expect } from 'vitest'
import { estimateATT, estimateATE, estimateTreatmentEffect } from '../treatment-effect'
import type { DataRow, MatchedPair } from '../types'

// Helper to build simple test data
function makeData(n: number, treatEffect = 2): {
  data: DataRow[]
  scores: number[]
  pairs: MatchedPair[]
} {
  // n/2 treated, n/2 control
  // Treated outcome = 10 + treatEffect, Control outcome = 10
  const data: DataRow[] = []
  const scores: number[] = []

  for (let i = 0; i < n; i++) {
    const t = i < n / 2 ? 1 : 0
    data.push({
      treatment: t,
      outcome: t === 1 ? 10 + treatEffect : 10,
      age: 30 + i,
    })
    scores.push(t === 1 ? 0.6 + (i * 0.01) : 0.4 + (i * 0.01))
  }

  // Perfect 1:1 pairs
  const pairs: MatchedPair[] = []
  const half = n / 2
  for (let i = 0; i < half; i++) {
    pairs.push({
      treatedIndex: i,
      controlIndex: i + half,
      propensityTreated: scores[i],
      propensityControl: scores[i + half],
      distance: Math.abs(scores[i] - scores[i + half]),
    })
  }

  return { data, scores, pairs }
}

describe('estimateATT', () => {
  it('should estimate ATT correctly with perfect pairs', () => {
    const { data, scores: _scores, pairs } = makeData(20, 3)
    const result = estimateATT(data, pairs, 'treatment', 'outcome')
    expect(result.att).toBeCloseTo(3, 5)
    expect(result.nPairs).toBe(10)
  })

  it('should return zero ATT for empty pairs', () => {
    const result = estimateATT([], [], 'treatment', 'outcome')
    expect(result.att).toBe(0)
    expect(result.nPairs).toBe(0)
  })

  it('should compute 95% CI bounds around ATT', () => {
    // Use different outcomes to ensure non-zero variance in diffs
    const data: DataRow[] = [
      { treatment: 1, outcome: 15 },
      { treatment: 1, outcome: 12 },
      { treatment: 1, outcome: 18 },
      { treatment: 0, outcome: 10 },
      { treatment: 0, outcome: 10 },
      { treatment: 0, outcome: 10 },
    ]
    const pairs: MatchedPair[] = [
      { treatedIndex: 0, controlIndex: 3, propensityTreated: 0.7, propensityControl: 0.4, distance: 0.3 },
      { treatedIndex: 1, controlIndex: 4, propensityTreated: 0.6, propensityControl: 0.35, distance: 0.25 },
      { treatedIndex: 2, controlIndex: 5, propensityTreated: 0.8, propensityControl: 0.45, distance: 0.35 },
    ]
    const result = estimateATT(data, pairs, 'treatment', 'outcome')
    // diffs: 5, 2, 8 — variable, so SE > 0
    expect(result.attCI95Lower).toBeLessThan(result.att)
    expect(result.attCI95Upper).toBeGreaterThan(result.att)
  })

  it('should have zero SE when all differences are identical', () => {
    const { data, scores: _scores, pairs } = makeData(20, 4)
    const result = estimateATT(data, pairs, 'treatment', 'outcome')
    // All diffs are exactly 4, so SE approaches 0
    expect(result.attSE).toBeCloseTo(0, 5)
  })

  it('should set outcomeVariable correctly', () => {
    const { data, scores: _scores, pairs } = makeData(10)
    const result = estimateATT(data, pairs, 'treatment', 'outcome')
    expect(result.outcomeVariable).toBe('outcome')
  })
})

describe('estimateATE', () => {
  it('should estimate ATE close to true effect', () => {
    const { data, scores } = makeData(40, 2)
    const result = estimateATE(data, scores, 'treatment', 'outcome')
    // ATE via IPW may not be exact due to clipping, but should be close
    expect(result.ate).toBeCloseTo(2, 0)
  })

  it('should return 0 ATE when treated and control have same outcome', () => {
    const data: DataRow[] = [
      { treatment: 1, outcome: 10 },
      { treatment: 1, outcome: 10 },
      { treatment: 0, outcome: 10 },
      { treatment: 0, outcome: 10 },
    ]
    const scores = [0.6, 0.7, 0.3, 0.4]
    const result = estimateATE(data, scores, 'treatment', 'outcome')
    expect(result.ate).toBeCloseTo(0, 5)
  })

  it('should have finite CI bounds', () => {
    const { data, scores } = makeData(20, 1)
    const result = estimateATE(data, scores, 'treatment', 'outcome')
    expect(isFinite(result.ate)).toBe(true)
    expect(isFinite(result.ateCI95Lower)).toBe(true)
    expect(isFinite(result.ateCI95Upper)).toBe(true)
  })
})

describe('estimateTreatmentEffect', () => {
  it('should return combined ATT and ATE result', () => {
    const { data, scores, pairs } = makeData(20, 3)
    const result = estimateTreatmentEffect(data, scores, pairs, 'treatment', 'outcome')
    expect(result.att).toBeCloseTo(3, 5)
    expect(typeof result.ate).toBe('number')
    expect(result.outcomeVariable).toBe('outcome')
    expect(result.nPairs).toBe(10)
  })
})
