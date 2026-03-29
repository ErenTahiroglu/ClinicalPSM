import type { BalanceRow, DataRow, MatchedPair, PsmResult } from './types'

function colStats(values: number[]): { mean: number; variance: number } {
  const n = values.length
  if (n === 0) return { mean: 0, variance: 0 }
  const mean = values.reduce((a, b) => a + b, 0) / n
  const variance =
    n > 1
      ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)
      : 0
  return { mean, variance }
}

function computeSmd(
  treatedVals: number[],
  controlVals: number[]
): { smd: number; sdPooled: number; varianceRatio: number } {
  const t = colStats(treatedVals)
  const c = colStats(controlVals)
  const pooledVariance = (t.variance + c.variance) / 2
  const sdPooled = Math.sqrt(pooledVariance)
  const smd = sdPooled === 0 ? 0 : (t.mean - c.mean) / sdPooled
  const varianceRatio = c.variance === 0 ? 0 : t.variance / c.variance
  return { smd, sdPooled, varianceRatio }
}

export function computeBalance(
  data: DataRow[],
  scores: number[],
  pairs: MatchedPair[],
  config: { treatmentColumn: string; covariates: string[] }
): BalanceRow[] {
  const { treatmentColumn, covariates } = config

  const allTreatedIdx = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 1)
    .map(({ i }) => i)

  const allControlIdx = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 0)
    .map(({ i }) => i)

  const matchedTreatedIdx = [...new Set(pairs.map(p => p.treatedIndex))]
  const matchedControlIdx = pairs.map(p => p.controlIndex)

  return covariates.map(cov => {
    const beforeT = allTreatedIdx.map(i => data[i][cov])
    const beforeC = allControlIdx.map(i => data[i][cov])
    const afterT = matchedTreatedIdx.map(i => data[i][cov])
    const afterC = matchedControlIdx.map(i => data[i][cov])

    const before = computeSmd(beforeT, beforeC)
    const after = computeSmd(afterT, afterC)
    const tStats = colStats(beforeT)
    const cStats = colStats(beforeC)

    return {
      covariate: cov,
      meanTreated: tStats.mean,
      meanControl: cStats.mean,
      sdPooled: before.sdPooled,
      smdBefore: before.smd,
      smdAfter: after.smd,
      varianceRatioBefore: before.varianceRatio,
      varianceRatioAfter: after.varianceRatio,
    }
  })
}

export function runPsm(
  data: DataRow[],
  scores: number[],
  pairs: MatchedPair[],
  config: { treatmentColumn: string; covariates: string[] },
  propensityResult: { converged: boolean }
): Omit<PsmResult, 'propensityScores'> & { propensityScores: number[] } {
  const balanceTable = computeBalance(data, scores, pairs, config)

  const nTreated = data.filter(r => r[config.treatmentColumn] === 1).length
  const nControl = data.filter(r => r[config.treatmentColumn] === 0).length
  const nMatched = new Set(pairs.map(p => p.treatedIndex)).size

  const overallSmdBefore =
    balanceTable.reduce((a, b) => a + Math.abs(b.smdBefore), 0) /
    balanceTable.length
  const overallSmdAfter =
    balanceTable.reduce((a, b) => a + Math.abs(b.smdAfter), 0) /
    balanceTable.length

  return {
    matchedPairs: pairs,
    nTreated,
    nControl,
    nMatched,
    propensityScores: scores,
    balanceTable,
    overallSmdBefore,
    overallSmdAfter,
    converged: propensityResult.converged,
  }
}
