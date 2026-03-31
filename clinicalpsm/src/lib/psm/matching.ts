import { PsmError } from './types'
import type { DataRow, MatchedPair, PsmConfig } from './types'

export function matchNearest(
  scores: number[],
  data: DataRow[],
  config: PsmConfig
): MatchedPair[] {
  const { treatmentColumn, ratio, caliper } = config

  const treatedIndices = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 1)
    .map(({ i }) => i)

  const controlIndices = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 0)
    .map(({ i }) => i)

  const availableControls = new Set(controlIndices)
  const pairs: MatchedPair[] = []

  for (const ti of treatedIndices) {
    for (let slot = 0; slot < ratio; slot++) {
      if (availableControls.size === 0) break

      let bestControl = -1
      let bestDistance = Infinity

      for (const ci of availableControls) {
        const dist = Math.abs(scores[ti] - scores[ci])
        if (dist < bestDistance) {
          bestDistance = dist
          bestControl = ci
        }
      }

      /* c8 ignore next — safety guard: unreachable when availableControls is non-empty */
      if (bestControl === -1) break
      if (caliper !== null && bestDistance > caliper) continue

      pairs.push({
        treatedIndex: ti,
        controlIndex: bestControl,
        propensityTreated: scores[ti],
        propensityControl: scores[bestControl],
        distance: bestDistance,
      })
      availableControls.delete(bestControl)
    }
  }

  if (pairs.length === 0) {
    throw new PsmError(
      'NO_MATCHES',
      caliper !== null
        ? `No matches found. The caliper (${caliper.toFixed(4)}) may be too narrow. Try increasing it or removing the caliper constraint.`
        : 'No matches could be formed. Please check your data.'
    )
  }

  return pairs
}
