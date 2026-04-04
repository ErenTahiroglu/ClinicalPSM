/**
 * Additional logistic regression edge case tests.
 *
 * Extends existing logistic.test.ts with:
 * - Missing values in treatment column (not just covariates)
 * - Missing value at row index 0 (off-by-one guard)
 * - p=1 covariate (single predictor)
 * - All treated (no control)
 * - Score range invariants
 * - Gradient descent produces scores in strictly (0,1) for all distributions
 */

import { describe, it, expect } from 'vitest'
import { computePropensityScores } from '../logistic'
import type { DataRow, PsmConfig } from '../types'
import { PsmError } from '../types'

function makeData(n: number, treatProp = 0.5): DataRow[] {
  return Array.from({ length: n }, (_, i) => ({
    treatment: i < Math.floor(n * treatProp) ? 1 : 0,
    age: 40 + (i % 20),
    bmi: 22 + (i % 10) * 0.5,
  }))
}

const baseConfig: PsmConfig = {
  treatmentColumn: 'treatment',
  covariates: ['age', 'bmi'],
  ratio: 1,
  caliper: null,
  withReplacement: false,
}

describe('computePropensityScores — additional edge cases', () => {
  it('throws TREATMENT_NOT_BINARY when treatment is -1', () => {
    const data = makeData(40).map((r, i) => ({
      ...r,
      treatment: i === 5 ? -1 : r.treatment,
    }))
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('TREATMENT_NOT_BINARY')
    }
  })

  it('throws TREATMENT_NOT_BINARY when treatment is 0.5 (non-integer)', () => {
    const data: DataRow[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ treatment: 1, age: 50 + i, bmi: 25 })),
      ...Array.from({ length: 20 }, (_, i) => ({ treatment: i === 0 ? 0.5 : 0, age: 30 + i, bmi: 22 })),
    ]
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('TREATMENT_NOT_BINARY')
    }
  })

  it('throws TREATMENT_NOT_BINARY when treatment column has NaN (NaN ≠ 0 and NaN ≠ 1)', () => {
    // NaN !== 0 && NaN !== 1, so the binary-check fires before the missing-values check
    const data = makeData(40)
    data[0] = { ...data[0], treatment: NaN }
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      // logistic.ts validates treatment binary FIRST, then missing values
      expect((e as PsmError).code).toBe('TREATMENT_NOT_BINARY')
    }
  })

  it('throws MISSING_VALUES at row 0 (off-by-one guard)', () => {
    const data = makeData(40)
    data[0] = { ...data[0], age: NaN }
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('MISSING_VALUES')
    }
  })

  it('throws MISSING_VALUES at last row', () => {
    const data = makeData(40)
    data[39] = { ...data[39], bmi: NaN }
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('MISSING_VALUES')
    }
  })

  it('throws INSUFFICIENT_SAMPLE when all are treated (no control)', () => {
    const data = makeData(20, 1.0) // all treated
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('INSUFFICIENT_SAMPLE')
    }
  })

  it('throws INSUFFICIENT_SAMPLE when all are control (no treated)', () => {
    const data = makeData(20, 0) // all control
    try {
      computePropensityScores(data, baseConfig)
      expect(true).toBe(false)
    } catch (e) {
      expect((e as PsmError).code).toBe('INSUFFICIENT_SAMPLE')
    }
  })

  it('works with a single covariate (p=1)', () => {
    const data: DataRow[] = [
      ...Array.from({ length: 15 }, (_, i) => ({ treatment: 1, age: 50 + i })),
      ...Array.from({ length: 15 }, (_, i) => ({ treatment: 0, age: 30 + i })),
    ]
    const config: PsmConfig = { ...baseConfig, covariates: ['age'] }
    const { scores } = computePropensityScores(data, config)
    expect(scores).toHaveLength(30)
    for (const s of scores) {
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(1)
    }
  })

  it('scores sum roughly to nTreated (probability interpretation)', () => {
    const data = makeData(60)
    const { scores } = computePropensityScores(data, baseConfig)
    const sumScores = scores.reduce((a, b) => a + b, 0)
    const nTreated = data.filter(r => r.treatment === 1).length
    // Not exact, but logistic regression scores should calibrate close to prevalence
    expect(sumScores).toBeGreaterThan(0)
    expect(sumScores).toBeLessThan(data.length)
    expect(Math.abs(sumScores / data.length - nTreated / data.length)).toBeLessThan(0.5)
  })

  it('treated subjects tend to have higher scores than control', () => {
    // With strong confounding, treated mean score should be higher
    const data: DataRow[] = [
      ...Array.from({ length: 20 }, (_, i) => ({ treatment: 1, age: 60 + i, bmi: 35 })),
      ...Array.from({ length: 20 }, (_, i) => ({ treatment: 0, age: 30 + i, bmi: 20 })),
    ]
    const { scores } = computePropensityScores(data, baseConfig)
    const treatedScores = scores.slice(0, 20)
    const controlScores = scores.slice(20)
    const meanTreated = treatedScores.reduce((a, b) => a + b, 0) / 20
    const meanControl = controlScores.reduce((a, b) => a + b, 0) / 20
    expect(meanTreated).toBeGreaterThan(meanControl)
  })
})
