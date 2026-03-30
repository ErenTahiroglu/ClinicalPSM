import { computePropensityScores } from './logistic'
import { matchNearest } from './matching'
import { runPsm } from './balance'
import { encodeData } from './encoding'
import type { DataRow, PsmConfig } from './types'
import { PsmError } from './types'
import type { RawRow } from './encoding'

export interface WorkerInput {
  rawData: RawRow[]
  config: PsmConfig
}

export interface WorkerOutput {
  type: 'result' | 'error'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  try {
    const { rawData, config } = event.data

    // Encode categorical covariates → numeric DataRow[]
    const { data: encodedData, encodedColumns } = encodeData(
      rawData,
      config.treatmentColumn,
      config.covariates
    )

    // Expand covariate list to include dummy columns
    const expandedCovariates = config.covariates.flatMap(col => {
      const dummies = encodedColumns.get(col)
      return dummies && dummies.length > 0 ? dummies : [col]
    })
    const encodedConfig: PsmConfig = { ...config, covariates: expandedCovariates }

    const propensityResult = computePropensityScores(encodedData, encodedConfig)
    const pairs = matchNearest(propensityResult.scores, encodedData, encodedConfig)
    const result = runPsm(encodedData, propensityResult.scores, pairs, encodedConfig, propensityResult)

    const response: WorkerOutput = { type: 'result', payload: result }
    self.postMessage(response)
  } catch (err) {
    const response: WorkerOutput = {
      type: 'error',
      payload:
        err instanceof PsmError
          ? { code: err.code, message: err.message }
          : { code: 'UNKNOWN', message: 'An unexpected error occurred.' },
    }
    self.postMessage(response)
  }
}
