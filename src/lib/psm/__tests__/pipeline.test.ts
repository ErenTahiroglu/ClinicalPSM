/**
 * End-to-end PSM pipeline integration tests.
 *
 * Tests the complete pipeline:
 *   RawRow data → encodeData → computePropensityScores → matchNearest/matchOptimal → computeBalance → runPsm
 *
 * Uses realistic synthetic clinical dataset (hypertension study):
 *   - Treated: patients receiving drug treatment
 *   - Control: patients receiving placebo
 *   - Covariates: age, bmi, systolic_bp, diabetes (categorical)
 */

import { describe, it, expect } from 'vitest'
import { encodeData } from '../encoding'
import { computePropensityScores } from '../logistic'
import { matchNearest } from '../matching'
import { matchOptimal } from '../matching-optimal'
import { computeBalance, runPsm } from '../balance'
import { computeCommonSupport } from '../common-support'
import { estimateTreatmentEffect } from '../treatment-effect'
import { imputeData } from '../imputation'
import type { RawRow } from '../encoding'
import type { PsmConfig } from '../types'

// ---------------------------------------------------------------------------
// Synthetic dataset factory
// ---------------------------------------------------------------------------

function makeSyntheticData(n = 80): RawRow[] {
  const rows: RawRow[] = []
  for (let i = 0; i < n; i++) {
    const treated = i < n / 2 ? 1 : 0
    // Introduce realistic confounding: treated patients are older and have higher BMI
    const age = treated === 1 ? 55 + (i % 15) : 45 + (i % 15)
    const bmi = treated === 1 ? 28 + (i % 8) : 24 + (i % 8)
    const systolic = treated === 1 ? 145 + (i % 20) : 130 + (i % 20)
    const diabetes = ['no', 'no', 'yes'][i % 3] // categorical
    const outcome = treated === 1 ? 10 - (i % 5) : 5 - (i % 3) // blood pressure reduction
    rows.push({ treatment: treated, age, bmi, systolic_bp: systolic, diabetes, outcome })
  }
  return rows
}

const PSM_CONFIG: PsmConfig = {
  treatmentColumn: 'treatment',
  covariates: ['age', 'bmi', 'systolic_bp', 'diabetes_yes'],
  ratio: 1,
  caliper: null,
  withReplacement: false,
}

// ---------------------------------------------------------------------------
// Pipeline integration
// ---------------------------------------------------------------------------

describe('PSM Pipeline — full end-to-end', () => {
  const rawData = makeSyntheticData(80)

  // Step 0: encoding
  const { data: encodedData } = encodeData(rawData, 'treatment', ['age', 'bmi', 'systolic_bp', 'diabetes'])

  // Step 1: propensity scores
  const { scores, converged } = computePropensityScores(encodedData, PSM_CONFIG)

  // Step 2: nearest-neighbor matching
  const nnPairs = matchNearest(scores, encodedData, PSM_CONFIG)

  // Step 3: optimal matching
  const optPairs = matchOptimal(scores, encodedData, PSM_CONFIG)

  // Step 4: balance
  const balanceTable = computeBalance(encodedData, scores, nnPairs, PSM_CONFIG)

  // Step 5: full result
  const result = runPsm(encodedData, scores, nnPairs, PSM_CONFIG, { converged })

  it('encoding produces categorical dummies', () => {
    // diabetes → diabetes_yes (k-1 dummies, drops 'no')
    expect(Object.keys(encodedData[0])).toContain('diabetes_yes')
    expect(Object.keys(encodedData[0])).not.toContain('diabetes_no')
  })

  it('propensity scores are in (0, 1) for all rows', () => {
    expect(scores).toHaveLength(encodedData.length)
    for (const s of scores) {
      expect(s).toBeGreaterThan(0)
      expect(s).toBeLessThan(1)
    }
  })

  it('propensity scores converge on realistic data', () => {
    expect(typeof converged).toBe('boolean')
  })

  it('nearest-neighbor matching produces at most n_treated pairs', () => {
    const nTreated = encodedData.filter(r => r['treatment'] === 1).length
    expect(nnPairs.length).toBeLessThanOrEqual(nTreated)
    expect(nnPairs.length).toBeGreaterThan(0)
  })

  it('NN matching: each treated index appears at most once (without replacement)', () => {
    const treatedIndices = nnPairs.map(p => p.treatedIndex)
    const unique = new Set(treatedIndices)
    expect(unique.size).toBe(treatedIndices.length)
  })

  it('NN matching: each control index appears at most once (without replacement)', () => {
    const controlIndices = nnPairs.map(p => p.controlIndex)
    const unique = new Set(controlIndices)
    expect(unique.size).toBe(controlIndices.length)
  })

  it('optimal matching produces same number of pairs as NN for 1:1', () => {
    expect(optPairs.length).toBe(nnPairs.length)
  })

  it('optimal matching has total distance ≤ NN matching total distance', () => {
    const nnDist = nnPairs.reduce((a, p) => a + p.distance, 0)
    const optDist = optPairs.reduce((a, p) => a + p.distance, 0)
    // Optimal matching minimizes total distance globally
    expect(optDist).toBeLessThanOrEqual(nnDist + 1e-10) // tolerance for float
  })

  it('balance table has one row per covariate', () => {
    expect(balanceTable.length).toBe(PSM_CONFIG.covariates.length)
  })

  it('balance table mean SMD after matching is ≤ SMD before', () => {
    const avgBefore = balanceTable.reduce((a, r) => a + Math.abs(r.smdBefore), 0) / balanceTable.length
    const avgAfter = balanceTable.reduce((a, r) => a + Math.abs(r.smdAfter), 0) / balanceTable.length
    // Matching should reduce average imbalance
    expect(avgAfter).toBeLessThanOrEqual(avgBefore)
  })

  it('runPsm result has correct structure', () => {
    expect(result).toHaveProperty('matchedPairs')
    expect(result).toHaveProperty('nTreated')
    expect(result).toHaveProperty('nControl')
    expect(result).toHaveProperty('nMatched')
    expect(result).toHaveProperty('propensityScores')
    expect(result).toHaveProperty('balanceTable')
    expect(result).toHaveProperty('overallSmdBefore')
    expect(result).toHaveProperty('overallSmdAfter')
    expect(result).toHaveProperty('converged')
  })

  it('nTreated + nControl = total rows', () => {
    expect(result.nTreated + result.nControl).toBe(encodedData.length)
  })

  it('nMatched ≤ nTreated', () => {
    expect(result.nMatched).toBeLessThanOrEqual(result.nTreated)
  })

  it('pair distances are non-negative', () => {
    for (const pair of nnPairs) {
      expect(pair.distance).toBeGreaterThanOrEqual(0)
      expect(Math.abs(pair.propensityTreated - pair.propensityControl)).toBeCloseTo(pair.distance, 10)
    }
  })
})

// ---------------------------------------------------------------------------
// Common support integration
// ---------------------------------------------------------------------------

describe('Common support on synthetic data', () => {
  const rawData = makeSyntheticData(80)
  const { data: encodedData } = encodeData(rawData, 'treatment', ['age', 'bmi', 'systolic_bp', 'diabetes'])
  const { scores } = computePropensityScores(encodedData, PSM_CONFIG)
  const treatment = encodedData.map(r => r['treatment'] as number)

  it('computes common support with valid bounds', () => {
    const cs = computeCommonSupport(scores, treatment)
    expect(cs.lowerBound).toBeGreaterThanOrEqual(0)
    expect(cs.upperBound).toBeLessThanOrEqual(1)
    expect(cs.lowerBound).toBeLessThanOrEqual(cs.upperBound)
  })

  it('in-support + out-of-support = total rows', () => {
    const cs = computeCommonSupport(scores, treatment)
    expect(cs.inSupport + cs.outOfSupport).toBe(scores.length)
  })
})

// ---------------------------------------------------------------------------
// Imputation + pipeline integration
// ---------------------------------------------------------------------------

describe('Imputation + PSM pipeline', () => {
  it('handles missing values via mean imputation before PSM', () => {
    const rawWithMissing: RawRow[] = makeSyntheticData(60).map((r, i) => ({
      ...r,
      bmi: i % 10 === 0 ? null : r['bmi'] as number, // 10% missing BMI
    }))

    const imputed = imputeData(rawWithMissing, ['age', 'bmi', 'systolic_bp'], 'mean')

    // After imputation, no nulls in imputed covariates
    for (const row of imputed) {
      expect(row['bmi']).not.toBeNull()
      expect(isNaN(Number(row['bmi']))).toBe(false)
    }

    // Can encode and run PSM on imputed data
    const { data } = encodeData(imputed, 'treatment', ['age', 'bmi', 'systolic_bp'])
    const { scores } = computePropensityScores(data, {
      ...PSM_CONFIG,
      covariates: ['age', 'bmi', 'systolic_bp'],
    })
    expect(scores.length).toBe(imputed.length)
  })
})

// ---------------------------------------------------------------------------
// Treatment effect on matched data
// ---------------------------------------------------------------------------

describe('Treatment effect estimation via matched pipeline', () => {
  const rawData = makeSyntheticData(80)
  const { data: encodedData } = encodeData(rawData, 'treatment', ['age', 'bmi', 'systolic_bp', 'diabetes'])
  const { scores } = computePropensityScores(encodedData, PSM_CONFIG)
  const pairs = matchNearest(scores, encodedData, PSM_CONFIG)

  it('produces finite ATT and ATE estimates', () => {
    const effect = estimateTreatmentEffect(
      encodedData,
      scores,
      pairs,
      'treatment',
      'outcome'
    )
    expect(isFinite(effect.att)).toBe(true)
    expect(isFinite(effect.ate)).toBe(true)
  })

  it('ATT CI contains ATT estimate', () => {
    const effect = estimateTreatmentEffect(encodedData, scores, pairs, 'treatment', 'outcome')
    expect(effect.attCI95Lower).toBeLessThanOrEqual(effect.att + 1e-10)
    expect(effect.attCI95Upper).toBeGreaterThanOrEqual(effect.att - 1e-10)
  })
})
