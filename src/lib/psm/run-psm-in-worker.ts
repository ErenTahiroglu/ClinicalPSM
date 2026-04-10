import type { PsmConfig, PsmResult } from './types'
import { PsmError } from './types'
import type { RawRow } from './encoding'
import type { WorkerInput, WorkerOutput } from './worker'

const WORKER_TIMEOUT_MS = 60_000

export function runPsmInWorker(
  rawData: RawRow[],
  config: PsmConfig
): Promise<PsmResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url))

    const timeout = setTimeout(() => {
      worker.terminate()
      reject(new PsmError('TIMEOUT', 'PSM computation timed out after 60 seconds.'))
    }, WORKER_TIMEOUT_MS)

    worker.onmessage = (event: MessageEvent<WorkerOutput>) => {
      clearTimeout(timeout)
      worker.terminate()
      const { type, payload } = event.data
      if (type === 'result') {
        resolve(payload as PsmResult)
      } else {
        reject(new PsmError(payload.code, payload.message))
      }
    }

    worker.onerror = (err) => {
      clearTimeout(timeout)
      worker.terminate()
      reject(new Error(err.message))
    }

    const input: WorkerInput = { rawData, config }
    worker.postMessage(input)
  })
}
