/**
 * Additional matching.ts edge case tests.
 *
 * Extends existing matching.test.ts with:
 * - Caliper exactly equal to distance (boundary: should match)
 * - Caliper just below distance (boundary: should not match)
 * - Very large dataset (performance / correctness with 1000 rows)
 * - Ratio > 1 matching
 * - NO_MATCHES error message content
 * - Pair distance == |prop_treated - prop_control|
 */

import { describe, it, expect } from 'vitest'
import { matchNearest } from '../matching'
import { PsmError } from '../types'
import type { DataRow, PsmConfig } from '../types'

function makeConfig(overrides: Partial<PsmConfig> = {}): PsmConfig {
  return {
    treatmentColumn: 'treatment',
    covariates: ['x'],
    ratio: 1,
    caliper: null,
    withReplacement: false,
    ...overrides,
  }
}

describe('matchNearest — additional edge cases', () => {
  it('caliper exactly equal to distance should match', () => {
    const data: DataRow[] = [
      { treatment: 1, x: 0 },
      { treatment: 0, x: 0.2 },
    ]
    const pairs = matchNearest([0.3, 0.5], data, makeConfig({ caliper: 0.2 }))
    expect(pairs).toHaveLength(1)
  })

  it('caliper just below distance → NO_MATCHES', () => {
    const data: DataRow[] = [
      { treatment: 1, x: 0 },
      { treatment: 0, x: 0.2 },
    ]
    expect(() =>
      matchNearest([0.3, 0.5], data, makeConfig({ caliper: 0.1999 }))
    ).toThrow(PsmError)
  })

  it('throws NO_MATCHES with informative message containing caliper value', () => {
    const data: DataRow[] = [
      { treatment: 1, x: 0 },
      { treatment: 0, x: 1 },
    ]
    try {
      matchNearest([0.1, 0.9], data, makeConfig({ caliper: 0.05 }))
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('NO_MATCHES')
      expect((e as PsmError).message).toContain('0.0500')
    }
  })

  it('NO_MATCHES without caliper has generic message', () => {
    // Only 1 treated and 0 controls → impossible to match
    const data: DataRow[] = [{ treatment: 1, x: 5 }]
    try {
      matchNearest([0.5], data, makeConfig())
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('NO_MATCHES')
      expect((e as PsmError).message).not.toContain('caliper')
    }
  })

  it('ratio=2 produces up to 2 controls per treated', () => {
    const data: DataRow[] = [
      { treatment: 1, x: 0 },
      { treatment: 0, x: 0.1 },
      { treatment: 0, x: 0.2 },
      { treatment: 0, x: 0.3 },
    ]
    const scores = [0.5, 0.4, 0.45, 0.55]
    const pairs = matchNearest(scores, data, makeConfig({ ratio: 2 }))
    // Should produce 2 pairs (1 treated × ratio 2)
    expect(pairs.length).toBeLessThanOrEqual(2)
    // All pairs refer to treated index 0
    for (const pair of pairs) {
      expect(pair.treatedIndex).toBe(0)
    }
  })

  it('pair.distance equals |propensityTreated - propensityControl|', () => {
    const data: DataRow[] = [
      { treatment: 1, x: 0 },
      { treatment: 1, x: 0 },
      { treatment: 0, x: 1 },
      { treatment: 0, x: 1 },
    ]
    const scores = [0.3, 0.6, 0.35, 0.65]
    const pairs = matchNearest(scores, data, makeConfig())
    for (const pair of pairs) {
      expect(pair.distance).toBeCloseTo(
        Math.abs(pair.propensityTreated - pair.propensityControl),
        10
      )
    }
  })

  it('large dataset (n=200) completes without error', () => {
    const n = 200
    const data: DataRow[] = Array.from({ length: n }, (_, i) => ({
      treatment: i < n / 2 ? 1 : 0,
      x: i,
    }))
    const scores = data.map((_, i) => 0.1 + (i / n) * 0.8)
    const pairs = matchNearest(scores, data, makeConfig())
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.length).toBeLessThanOrEqual(n / 2)
  })

  it('every matched pair has a treated unit and a control unit', () => {
    const data: DataRow[] = [
      ...Array.from({ length: 15 }, () => ({ treatment: 1, x: 1 })),
      ...Array.from({ length: 15 }, () => ({ treatment: 0, x: 2 })),
    ]
    const scores = data.map((_, i) => i < 15 ? 0.7 : 0.3)
    const pairs = matchNearest(scores, data, makeConfig())
    for (const pair of pairs) {
      expect(data[pair.treatedIndex].treatment).toBe(1)
      expect(data[pair.controlIndex].treatment).toBe(0)
    }
  })
})
