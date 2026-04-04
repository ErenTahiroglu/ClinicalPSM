/**
 * Common Support Analysis
 *
 * Identifies the "common support" region — the range of propensity scores
 * where both treated and control units exist. Subjects outside this region
 * cannot be meaningfully compared.
 *
 * Reference: Heckman, LaLonde & Smith (1999); Smith & Todd (2005)
 */

export interface CommonSupportResult {
  /** Lower bound of common support (max of treated/control minima) */
  lowerBound: number
  /** Upper bound of common support (min of treated/control maxima) */
  upperBound: number
  /** Number of treated units outside common support */
  treatedOutside: number
  /** Number of control units outside common support */
  controlOutside: number
  /** Total units inside common support */
  inSupport: number
  /** Total units outside common support */
  outOfSupport: number
  /** Indices of treated units outside support (for trimming) */
  treatedOutsideIndices: number[]
  /** Indices of control units outside support (for trimming) */
  controlOutsideIndices: number[]
}

/**
 * Computes the common support region for propensity scores.
 *
 * @param scores - Propensity score for each observation
 * @param treatment - Binary treatment indicator (1=treated, 0=control)
 */
export function computeCommonSupport(
  scores: number[],
  treatment: number[]
): CommonSupportResult {
  const treatedScores = scores
    .map((s, i) => ({ score: s, idx: i }))
    .filter((_, i) => treatment[i] === 1)

  const controlScores = scores
    .map((s, i) => ({ score: s, idx: i }))
    .filter((_, i) => treatment[i] === 0)

  if (treatedScores.length === 0 || controlScores.length === 0) {
    return {
      lowerBound: 0,
      upperBound: 1,
      treatedOutside: 0,
      controlOutside: 0,
      inSupport: scores.length,
      outOfSupport: 0,
      treatedOutsideIndices: [],
      controlOutsideIndices: [],
    }
  }

  const treatedMin = Math.min(...treatedScores.map(t => t.score))
  const treatedMax = Math.max(...treatedScores.map(t => t.score))
  const controlMin = Math.min(...controlScores.map(c => c.score))
  const controlMax = Math.max(...controlScores.map(c => c.score))

  // Common support: overlap region
  const lowerBound = Math.max(treatedMin, controlMin)
  const upperBound = Math.min(treatedMax, controlMax)

  const treatedOutsideIndices = treatedScores
    .filter(t => t.score < lowerBound || t.score > upperBound)
    .map(t => t.idx)

  const controlOutsideIndices = controlScores
    .filter(c => c.score < lowerBound || c.score > upperBound)
    .map(c => c.idx)

  const outOfSupport = treatedOutsideIndices.length + controlOutsideIndices.length

  return {
    lowerBound,
    upperBound,
    treatedOutside: treatedOutsideIndices.length,
    controlOutside: controlOutsideIndices.length,
    inSupport: scores.length - outOfSupport,
    outOfSupport,
    treatedOutsideIndices,
    controlOutsideIndices,
  }
}

/**
 * Trims the dataset to units within common support.
 * Returns indices of rows to keep.
 */
export function trimToCommonSupport(
  scores: number[],
  support: CommonSupportResult
): number[] {
  return scores
    .map((s, i) => ({ score: s, idx: i }))
    .filter(({ score }) => score >= support.lowerBound && score <= support.upperBound)
    .map(({ idx }) => idx)
}
