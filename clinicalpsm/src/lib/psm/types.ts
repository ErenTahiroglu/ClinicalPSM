export type PsmErrorCode =
  | 'INSUFFICIENT_SAMPLE'
  | 'NO_VARIANCE'
  | 'TREATMENT_NOT_BINARY'
  | 'MISSING_VALUES'
  | 'CONVERGENCE_FAILURE'
  | 'NO_MATCHES'

export class PsmError extends Error {
  constructor(
    public readonly code: PsmErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'PsmError'
  }
}

export interface PsmConfig {
  treatmentColumn: string
  covariates: string[]
  ratio: 1 | 2 | 3
  caliper: number | null
  withReplacement: false
}

export type DataRow = Record<string, number>

export interface MatchedPair {
  treatedIndex: number
  controlIndex: number
  propensityTreated: number
  propensityControl: number
  distance: number
}

export interface BalanceRow {
  covariate: string
  meanTreated: number
  meanControl: number
  sdPooled: number
  smdBefore: number
  smdAfter: number
  varianceRatioBefore: number
  varianceRatioAfter: number
}

export interface PsmResult {
  matchedPairs: MatchedPair[]
  nTreated: number
  nControl: number
  nMatched: number
  propensityScores: number[]
  balanceTable: BalanceRow[]
  overallSmdBefore: number
  overallSmdAfter: number
  converged: boolean
}
