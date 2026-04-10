/**
 * Regression tests: empty covariates must throw NO_VARIANCE, not silently produce NaN.
 *
 * Bug fixed in logistic.ts: added early guard for covariates.length === 0.
 * Without this fix, runPsm computed 0/0=NaN for overallSmdBefore/After.
 */
import { describe, it, expect } from 'vitest'
import { computePropensityScores } from '../logistic'
import { PsmError } from '../types'
import type { DataRow, PsmConfig } from '../types'

const data: DataRow[] = [
  ...Array.from({ length: 15 }, (_, i) => ({ treatment: 1, age: 50 + i })),
  ...Array.from({ length: 15 }, (_, i) => ({ treatment: 0, age: 30 + i })),
]

const config: PsmConfig = {
  treatmentColumn: 'treatment',
  covariates: [],
  ratio: 1,
  caliper: null,
  withReplacement: false,
}

describe('Empty covariates — NaN regression', () => {
  it('throws NO_VARIANCE PsmError when covariates is empty', () => {
    expect(() => computePropensityScores(data, config)).toThrow(PsmError)
  })

  it('throws with code NO_VARIANCE and a meaningful message', () => {
    try {
      computePropensityScores(data, config)
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PsmError)
      expect((e as PsmError).code).toBe('NO_VARIANCE')
      expect((e as PsmError).message).toMatch(/covariate/i)
    }
  })
})
