/**
 * Treatment Effect Estimation
 *
 * Implements two estimators for causal effect of treatment:
 *
 * - ATT (Average Treatment Effect on the Treated):
 *   The mean outcome difference among treated units and their matched controls.
 *   Most common in PSM studies.
 *
 * - ATE (Average Treatment Effect):
 *   The mean treatment effect across the entire population.
 *   Requires inverse probability weighting (IPW).
 *
 * Reference: Austin (2011), "An Introduction to Propensity Score Methods"
 * Statistical Methods in Medical Research, 20(3):321-352
 */

import type { DataRow, MatchedPair } from './types'

export interface TreatmentEffectResult {
  /** Outcome variable name */
  outcomeVariable: string

  /** ATT estimate — average effect on treated units */
  att: number
  /** Standard error of ATT */
  attSE: number
  /** 95% CI lower bound */
  attCI95Lower: number
  /** 95% CI upper bound */
  attCI95Upper: number

  /** ATE estimate via IPW (requires propensity scores) */
  ate: number
  /** Standard error of ATE */
  ateSE: number
  /** 95% CI lower bound */
  ateCI95Lower: number
  /** 95% CI upper bound */
  ateCI95Upper: number

  /** Number of matched pairs used in ATT estimation */
  nPairs: number
}

/**
 * Estimates ATT from matched pairs.
 *
 * ATT = (1/n) * Σ (Y_treated_i - Y_control_i)
 *
 * @param data - Encoded data rows
 * @param pairs - Matched pairs from PSM
 * @param treatmentColumn - Name of treatment column
 * @param outcomeColumn - Name of outcome column (must be numeric)
 */
export function estimateATT(
  data: DataRow[],
  pairs: MatchedPair[],
  treatmentColumn: string,
  outcomeColumn: string
): Pick<TreatmentEffectResult, 'att' | 'attSE' | 'attCI95Lower' | 'attCI95Upper' | 'nPairs' | 'outcomeVariable'> {
  if (pairs.length === 0) {
    return {
      outcomeVariable: outcomeColumn,
      att: 0,
      attSE: 0,
      attCI95Lower: 0,
      attCI95Upper: 0,
      nPairs: 0,
    }
  }

  void treatmentColumn // referenced for documentation clarity

  const diffs = pairs.map(p => {
    const yTreated = data[p.treatedIndex][outcomeColumn] ?? 0
    const yControl = data[p.controlIndex][outcomeColumn] ?? 0
    return yTreated - yControl
  })

  const n = diffs.length
  const att = diffs.reduce((a, b) => a + b, 0) / n

  // Sample standard deviation of differences
  const variance =
    n > 1
      ? diffs.reduce((a, d) => a + (d - att) ** 2, 0) / (n - 1)
      : 0
  const se = Math.sqrt(variance / n)

  // 95% CI using t-distribution (approx z=1.96 for large n)
  const z = 1.96
  return {
    outcomeVariable: outcomeColumn,
    att,
    attSE: se,
    attCI95Lower: att - z * se,
    attCI95Upper: att + z * se,
    nPairs: n,
  }
}

/**
 * Estimates ATE via Inverse Probability Weighting (IPW).
 *
 * IPW weights:
 *   Treated:  w_i = 1 / p_i
 *   Control:  w_i = 1 / (1 - p_i)
 *
 * Stabilized Horvitz-Thompson estimator:
 *   ATE = (Σ w_i * Y_i * T_i) / (Σ w_i * T_i) - (Σ w_i * Y_i * (1-T_i)) / (Σ w_i * (1-T_i))
 *
 * @param data - Encoded data rows
 * @param scores - Propensity scores for each observation
 * @param treatmentColumn - Name of treatment column
 * @param outcomeColumn - Name of outcome column (must be numeric)
 */
export function estimateATE(
  data: DataRow[],
  scores: number[],
  treatmentColumn: string,
  outcomeColumn: string
): Pick<TreatmentEffectResult, 'ate' | 'ateSE' | 'ateCI95Lower' | 'ateCI95Upper' | 'outcomeVariable'> {
  const n = data.length

  // Clamp propensity scores to avoid infinite weights
  const CLIP = 0.01
  const clampedScores = scores.map(s => Math.max(CLIP, Math.min(1 - CLIP, s)))

  let numeratorT = 0
  let denominatorT = 0
  let numeratorC = 0
  let denominatorC = 0

  for (let i = 0; i < n; i++) {
    const t = data[i][treatmentColumn] as number
    const y = (data[i][outcomeColumn] ?? 0) as number
    const p = clampedScores[i]

    if (t === 1) {
      const w = 1 / p
      numeratorT += w * y
      denominatorT += w
    } else {
      const w = 1 / (1 - p)
      numeratorC += w * y
      denominatorC += w
    }
  }

  const meanT = denominatorT > 0 ? numeratorT / denominatorT : 0
  const meanC = denominatorC > 0 ? numeratorC / denominatorC : 0
  const ate = meanT - meanC

  // Bootstrap SE approximation: variance of IPW estimator
  // Using conservative plug-in estimate: var(Y_T/p) + var(Y_C/(1-p))
  const weightsT: number[] = []
  const weightsC: number[] = []
  const wYT: number[] = []
  const wYC: number[] = []

  for (let i = 0; i < n; i++) {
    const t = data[i][treatmentColumn] as number
    const y = (data[i][outcomeColumn] ?? 0) as number
    const p = clampedScores[i]
    if (t === 1) {
      const w = 1 / p
      weightsT.push(w)
      wYT.push(w * y)
    } else {
      const w = 1 / (1 - p)
      weightsC.push(w)
      wYC.push(w * y)
    }
  }

  function weightedVariance(wy: number[], w: number[]): number {
    const sumW = w.reduce((a, b) => a + b, 0)
    if (sumW === 0 || w.length < 2) return 0
    const mean = wy.reduce((a, b) => a + b, 0) / sumW
    return wy.reduce((acc, val, idx) => acc + w[idx] * (val / w[idx] - mean) ** 2, 0) / sumW
  }

  const varT = weightedVariance(wYT, weightsT)
  const varC = weightedVariance(wYC, weightsC)
  const se = Math.sqrt((varT + varC) / n)
  const z = 1.96

  return {
    outcomeVariable: outcomeColumn,
    ate,
    ateSE: se,
    ateCI95Lower: ate - z * se,
    ateCI95Upper: ate + z * se,
  }
}

/**
 * Convenience function — computes both ATT and ATE.
 */
export function estimateTreatmentEffect(
  data: DataRow[],
  scores: number[],
  pairs: MatchedPair[],
  treatmentColumn: string,
  outcomeColumn: string
): TreatmentEffectResult {
  const attResult = estimateATT(data, pairs, treatmentColumn, outcomeColumn)
  const ateResult = estimateATE(data, scores, treatmentColumn, outcomeColumn)

  return {
    ...attResult,
    ...ateResult,
    outcomeVariable: outcomeColumn,
  }
}
