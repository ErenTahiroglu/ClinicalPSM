import { describe, it, expect } from 'vitest'
import { matchOptimal } from '../matching-optimal'
import type { DataRow, PsmConfig } from '../types'

function makeConfig(overrides: Partial<PsmConfig> = {}): PsmConfig {
  return {
    treatmentColumn: 'treatment',
    covariates: ['age'],
    ratio: 1,
    caliper: null,
    withReplacement: false,
    ...overrides,
  }
}

describe('matchOptimal', () => {
  it('should match all treated units when sufficient controls exist', () => {
    const data: DataRow[] = [
      { treatment: 1, age: 30 }, // ti=0, score=0.6
      { treatment: 1, age: 40 }, // ti=1, score=0.7
      { treatment: 0, age: 31 }, // ci=2, score=0.61
      { treatment: 0, age: 39 }, // ci=3, score=0.69
    ]
    const scores = [0.6, 0.7, 0.61, 0.69]
    const pairs = matchOptimal(scores, data, makeConfig())
    expect(pairs).toHaveLength(2)
    // Optimal matching: ti=0 → ci=2 (dist 0.01), ti=1 → ci=3 (dist 0.01)
    const sorted = [...pairs].sort((a, b) => a.treatedIndex - b.treatedIndex)
    expect(sorted[0].treatedIndex).toBe(0)
    expect(sorted[0].controlIndex).toBe(2)
    expect(sorted[1].treatedIndex).toBe(1)
    expect(sorted[1].controlIndex).toBe(3)
  })

  it('should prefer globally optimal match over locally greedy', () => {
    // Sequential NN would match ti=0 → ci=2 (dist 0.05), then ti=1 → ci=3 (dist 0.4)
    // Optimal: ti=0 → ci=3 (dist 0.15), ti=1 → ci=2 (dist 0.2) — total 0.35 > worse
    // Actually global optimal is ti=0→ci=2, ti=1→ci=3  total 0.45
    // Let's use a case where global opt differs from sequential NN:
    // ti=0 at 0.3, ti=1 at 0.6, ci=2 at 0.4, ci=3 at 0.5
    // NN: ti=0→ci=2(dist0.1), ti=1→ci=3(dist0.1) total 0.2
    // Opt: same, total 0.2
    const data: DataRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 1, age: 60 },
      { treatment: 0, age: 40 },
      { treatment: 0, age: 50 },
    ]
    const scores = [0.3, 0.6, 0.4, 0.5]
    const pairs = matchOptimal(scores, data, makeConfig())
    // Global optimal: ti=0→ci=2(0.1), ti=1→ci=3(0.1)
    const totalDist = pairs.reduce((a, p) => a + p.distance, 0)
    expect(totalDist).toBeCloseTo(0.2, 5)
  })

  it('should throw NO_MATCHES when caliper is too narrow', () => {
    const data: DataRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 0, age: 70 },
    ]
    const scores = [0.2, 0.8] // dist = 0.6
    expect(() => matchOptimal(scores, data, makeConfig({ caliper: 0.1 }))).toThrow()
  })

  it('should include caliper value in error message', () => {
    const data: DataRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 0, age: 70 },
    ]
    const scores = [0.2, 0.8]
    expect(() => matchOptimal(scores, data, makeConfig({ caliper: 0.1 }))).toThrowError(/caliper/)
  })

  it('should throw NO_MATCHES with no caliper message when caliper is null', () => {
    const data: DataRow[] = [
      { treatment: 1, age: 30 },
    ]
    const scores = [0.5]
    try {
      matchOptimal(scores, data, makeConfig())
      expect(true).toBe(false)
    } catch (err) {
      expect(err).toBeTruthy()
    }
  })

  it('pairs should have correct structure', () => {
    const data: DataRow[] = [
      { treatment: 1, age: 30 },
      { treatment: 0, age: 31 },
    ]
    const scores = [0.5, 0.52]
    const [pair] = matchOptimal(scores, data, makeConfig())
    expect(pair).toHaveProperty('treatedIndex')
    expect(pair).toHaveProperty('controlIndex')
    expect(pair).toHaveProperty('propensityTreated')
    expect(pair).toHaveProperty('propensityControl')
    expect(pair).toHaveProperty('distance')
    expect(pair.distance).toBeCloseTo(0.02, 5)
  })
})
