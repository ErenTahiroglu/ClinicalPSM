import { describe, it, expect } from 'vitest'
import { matchNearest } from '../matching'
import { PsmError } from '../types'
import type { DataRow, PsmConfig } from '../types'

function makeScoresAndData(nTreated: number, nControl: number): {
  scores: number[]
  data: DataRow[]
} {
  const treatedScores = Array.from({ length: nTreated }, (_, i) => 0.5 + i * 0.01)
  const controlScores = Array.from({ length: nControl }, (_, i) => 0.48 + i * 0.01)
  const scores = [...treatedScores, ...controlScores]
  const data: DataRow[] = [
    ...treatedScores.map(() => ({ treatment: 1, age: 50 })),
    ...controlScores.map(() => ({ treatment: 0, age: 45 })),
  ]
  return { scores, data }
}

const baseConfig: PsmConfig = {
  treatmentColumn: 'treatment',
  covariates: ['age'],
  ratio: 1,
  caliper: null,
  withReplacement: false,
}

describe('matchNearest', () => {
  it('produces at most nTreated pairs for 1:1 matching', () => {
    const { scores, data } = makeScoresAndData(20, 30)
    const pairs = matchNearest(scores, data, baseConfig)
    expect(pairs.length).toBeLessThanOrEqual(20)
  })

  it('produces at most nTreated * ratio pairs for 1:2 matching', () => {
    const { scores, data } = makeScoresAndData(10, 40)
    const config: PsmConfig = { ...baseConfig, ratio: 2 }
    const pairs = matchNearest(scores, data, config)
    expect(pairs.length).toBeLessThanOrEqual(20)
  })

  it('produces at most nTreated * ratio pairs for 1:3 matching', () => {
    const { scores, data } = makeScoresAndData(10, 50)
    const config: PsmConfig = { ...baseConfig, ratio: 3 }
    const pairs = matchNearest(scores, data, config)
    expect(pairs.length).toBeLessThanOrEqual(30)
  })

  it('respects caliper and excludes distant matches', () => {
    // Treated PS = 0.9, Control PS = 0.1 — distance 0.8 > caliper 0.05
    const scores = [0.9, 0.1]
    const data: DataRow[] = [{ treatment: 1, age: 50 }, { treatment: 0, age: 45 }]
    expect(() =>
      matchNearest(scores, data, { ...baseConfig, caliper: 0.05 })
    ).toThrow(PsmError)
    try {
      matchNearest(scores, data, { ...baseConfig, caliper: 0.05 })
    } catch (e) {
      expect((e as PsmError).code).toBe('NO_MATCHES')
    }
  })

  it('matches within caliper when distance is small enough', () => {
    const scores = [0.5, 0.49]
    const data: DataRow[] = [{ treatment: 1, age: 50 }, { treatment: 0, age: 45 }]
    const pairs = matchNearest(scores, data, { ...baseConfig, caliper: 0.05 })
    expect(pairs).toHaveLength(1)
    expect(pairs[0].distance).toBeCloseTo(0.01, 5)
  })

  it('throws NO_MATCHES when no controls available', () => {
    const scores = [0.5]
    const data: DataRow[] = [{ treatment: 1, age: 50 }]
    expect(() => matchNearest(scores, data, baseConfig)).toThrow(PsmError)
  })

  it('does not reuse controls (without replacement)', () => {
    const { scores, data } = makeScoresAndData(5, 5)
    const pairs = matchNearest(scores, data, baseConfig)
    const controlIndices = pairs.map(p => p.controlIndex)
    const uniqueControls = new Set(controlIndices)
    expect(uniqueControls.size).toBe(controlIndices.length)
  })
})
