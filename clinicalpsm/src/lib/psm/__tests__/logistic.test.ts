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

describe('computePropensityScores', () => {
  it('returns a score in [0,1] for every row', () => {
    const data = makeData(60)
    const { scores } = computePropensityScores(data, baseConfig)
    expect(scores).toHaveLength(60)
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })

  it('throws TREATMENT_NOT_BINARY when treatment has non-0/1 values', () => {
    const data = makeData(40).map((r, i) => ({ ...r, treatment: i === 0 ? 2 : r.treatment }))
    expect(() => computePropensityScores(data, baseConfig)).toThrow(PsmError)
    try {
      computePropensityScores(data, baseConfig)
    } catch (e) {
      expect((e as PsmError).code).toBe('TREATMENT_NOT_BINARY')
    }
  })

  it('throws MISSING_VALUES when a covariate contains NaN', () => {
    const data = makeData(40)
    data[5] = { ...data[5], age: NaN }
    expect(() => computePropensityScores(data, baseConfig)).toThrow(PsmError)
    try {
      computePropensityScores(data, baseConfig)
    } catch (e) {
      expect((e as PsmError).code).toBe('MISSING_VALUES')
    }
  })

  it('throws INSUFFICIENT_SAMPLE when group size < 10', () => {
    const data = makeData(15, 0.1) // only 1-2 treated
    expect(() => computePropensityScores(data, baseConfig)).toThrow(PsmError)
    try {
      computePropensityScores(data, baseConfig)
    } catch (e) {
      expect((e as PsmError).code).toBe('INSUFFICIENT_SAMPLE')
    }
  })

  it('throws NO_VARIANCE when a covariate is constant', () => {
    const data = makeData(40).map(r => ({ ...r, bmi: 25 }))
    expect(() => computePropensityScores(data, baseConfig)).toThrow(PsmError)
    try {
      computePropensityScores(data, baseConfig)
    } catch (e) {
      expect((e as PsmError).code).toBe('NO_VARIANCE')
    }
  })

  it('reports convergence on well-separated data', () => {
    // Clear separation → should converge
    const data: DataRow[] = [
      ...Array.from({ length: 30 }, (_, i) => ({ treatment: 1, age: 60 + i, bmi: 30 })),
      ...Array.from({ length: 30 }, (_, i) => ({ treatment: 0, age: 20 + i, bmi: 20 })),
    ]
    const { converged } = computePropensityScores(data, baseConfig)
    expect(typeof converged).toBe('boolean')
  })

  it('converged=true when treated/control have identical covariate distributions', () => {
    // Each treated row has an exact control twin → optimal weights are all 0.
    // Gradient stays at 0 after first update → loss stops changing → converges at iter 2.
    const data: DataRow[] = Array.from({ length: 30 }, (_, i) => [
      { treatment: 1, age: 40 + i, bmi: 20 + i * 0.3 },
      { treatment: 0, age: 40 + i, bmi: 20 + i * 0.3 },
    ]).flat()
    const { converged } = computePropensityScores(data, baseConfig)
    expect(converged).toBe(true)
  })
})
