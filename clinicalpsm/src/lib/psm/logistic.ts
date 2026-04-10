import { PsmError } from './types'
import type { DataRow, PsmConfig } from './types'

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z))
}

interface LogisticResult {
  scores: number[]
  converged: boolean
}

export function computePropensityScores(
  data: DataRow[],
  config: PsmConfig
): LogisticResult {
  const n = data.length
  const { treatmentColumn, covariates } = config

  // Validate treatment is binary
  for (const row of data) {
    const t = row[treatmentColumn]
    if (t !== 0 && t !== 1) {
      throw new PsmError(
        'TREATMENT_NOT_BINARY',
        `Treatment column "${treatmentColumn}" must contain only 0 and 1 values.`
      )
    }
  }

  // Check for missing values
  for (let i = 0; i < n; i++) {
    for (const col of [treatmentColumn, ...covariates]) {
      if (data[i][col] === null || data[i][col] === undefined || isNaN(data[i][col])) {
        throw new PsmError(
          'MISSING_VALUES',
          `Missing values detected in column "${col}" at row ${i + 1}. Please clean your data before analysis.`
        )
      }
    }
  }

  const T = data.map(row => row[treatmentColumn])
  const nTreated = T.filter(t => t === 1).length
  const nControl = T.filter(t => t === 0).length

  if (nTreated < 10 || nControl < 10) {
    throw new PsmError(
      'INSUFFICIENT_SAMPLE',
      `Insufficient sample size: ${nTreated} treated and ${nControl} control units. Minimum 10 per group required.`
    )
  }

  const p = covariates.length

  if (p === 0) {
    throw new PsmError(
      'NO_VARIANCE',
      'At least one covariate must be selected for PSM analysis.'
    )
  }

  // Build raw covariate matrix
  const X: number[][] = data.map(row => covariates.map(col => row[col]))

  // Compute column means and standard deviations for standardization
  const means = new Array<number>(p).fill(0)
  const stds = new Array<number>(p).fill(0)

  for (let j = 0; j < p; j++) {
    const col = X.map(row => row[j])
    const mean = col.reduce((a, b) => a + b, 0) / n
    const variance = col.reduce((a, b) => a + (b - mean) ** 2, 0) / n
    if (variance === 0) {
      throw new PsmError(
        'NO_VARIANCE',
        `Covariate "${covariates[j]}" has zero variance — all values are identical. Remove it from the analysis.`
      )
    }
    means[j] = mean
    stds[j] = Math.sqrt(variance)
  }

  // Standardize
  const Xstd: number[][] = X.map(row =>
    row.map((val, j) => (val - means[j]) / stds[j])
  )

  // Gradient descent
  const weights = new Array<number>(p).fill(0)
  let bias = 0
  let prevLoss = Infinity
  let converged = false

  for (let iter = 0; iter < 100; iter++) {
    const gradW = new Array<number>(p).fill(0)
    let gradB = 0
    let loss = 0

    for (let i = 0; i < n; i++) {
      let z = bias
      for (let j = 0; j < p; j++) z += weights[j] * Xstd[i][j]
      const pred = sigmoid(z)
      const err = pred - T[i]

      for (let j = 0; j < p; j++) gradW[j] += err * Xstd[i][j]
      gradB += err

      loss -=
        T[i] * Math.log(Math.max(pred, 1e-15)) +
        (1 - T[i]) * Math.log(Math.max(1 - pred, 1e-15))
    }

    loss /= n
    const lr = 0.01
    for (let j = 0; j < p; j++) weights[j] -= (lr / n) * gradW[j]
    bias -= (lr / n) * gradB

    if (Math.abs(prevLoss - loss) < 1e-6) {
      converged = true
      break
    }
    prevLoss = loss
  }

  // Compute final scores on original (non-standardized) data using fitted weights
  const scores = data.map((_, i) => {
    let z = bias
    for (let j = 0; j < p; j++) z += weights[j] * Xstd[i][j]
    return sigmoid(z)
  })

  return { scores, converged }
}
