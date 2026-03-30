import type { PsmConfig, PsmResult } from './types'
import { PsmError } from './types'
import type { RawRow } from './encoding'
import type { WorkerInput, WorkerOutput } from './worker'

export function runPsmInWorker(
  rawData: RawRow[],
  config: PsmConfig
): Promise<PsmResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url))

    worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
      worker.terminate()
      const { type, payload } = event.data
      if (type === 'result') {
        resolve(payload as PsmResult)
      } else {
        reject(new PsmError(payload.code, payload.message))
      }
    }

    worker.onerror = (err) => {
      worker.terminate()
      reject(new Error(err.message))
    }

    const input: WorkerInput = { rawData, config }
    worker.postMessage(input)
  })
}
