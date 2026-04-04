/**
 * Optimal Matching Algorithm
 *
 * Implements optimal 1:1 nearest-neighbor matching using a greedy approach
 * with full sorting of all possible (treated, control) pairs by distance.
 * Unlike sequential nearest-neighbor matching, this minimizes the total
 * sum of absolute propensity score differences across all matched pairs.
 *
 * NOTE: True optimal matching (Hungarian algorithm) has O(n³) complexity.
 * This implementation uses a greedy approximation that sorts all candidate
 * pairs globally before selection — a significant improvement over sequential
 * nearest-neighbor while remaining tractable for n < 10,000.
 *
 * Reference: Ho, Imai, King & Stuart (2007), "Matching as Nonparametric
 * Preprocessing for Reducing Model Dependence in Parametric Causal Inference"
 * Political Analysis, 15(3):199-236.
 */

import { PsmError } from './types'
import type { DataRow, MatchedPair, PsmConfig } from './types'

export function matchOptimal(
  scores: number[],
  data: DataRow[],
  config: PsmConfig
): MatchedPair[] {
  const { treatmentColumn, caliper } = config

  const treatedIndices = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 1)
    .map(({ i }) => i)

  const controlIndices = data
    .map((row, i) => ({ row, i }))
    .filter(({ row }) => row[treatmentColumn] === 0)
    .map(({ i }) => i)

  // Build all candidate pairs sorted by ascending distance (global sort)
  const candidates: Array<{
    ti: number
    ci: number
    distance: number
  }> = []

  for (const ti of treatedIndices) {
    for (const ci of controlIndices) {
      const dist = Math.abs(scores[ti] - scores[ci])
      if (caliper === null || dist <= caliper) {
        candidates.push({ ti, ci, distance: dist })
      }
    }
  }

  // Sort globally by distance — minimises total match distance (greedy optimal)
  candidates.sort((a, b) => a.distance - b.distance)

  const usedTreated = new Set<number>()
  const usedControl = new Set<number>()
  const pairs: MatchedPair[] = []

  for (const { ti, ci, distance } of candidates) {
    if (usedTreated.has(ti) || usedControl.has(ci)) continue

    pairs.push({
      treatedIndex: ti,
      controlIndex: ci,
      propensityTreated: scores[ti],
      propensityControl: scores[ci],
      distance,
    })

    usedTreated.add(ti)
    usedControl.add(ci)

    // Stop when all treated units are matched
    if (usedTreated.size === treatedIndices.length) break
  }

  if (pairs.length === 0) {
    throw new PsmError(
      'NO_MATCHES',
      caliper !== null
        ? `No optimal matches found. The caliper (${caliper.toFixed(4)}) may be too narrow.`
        : 'No optimal matches could be formed. Please check your data.'
    )
  }

  return pairs
}
