import { describe, it, expect } from 'vitest'
import { computeCommonSupport, trimToCommonSupport } from '../common-support'

describe('computeCommonSupport', () => {
  const scores =    [0.1, 0.3, 0.5, 0.7, 0.9, 0.2, 0.4, 0.6, 0.8, 0.95]
  const treatment = [  1,   1,   1,   1,   1,   0,   0,   0,   0,   0  ]

  it('should compute lower and upper bounds from score distributions', () => {
    const result = computeCommonSupport(scores, treatment)
    // Treated: 0.1 – 0.9, Control: 0.2 – 0.95
    // Common support: max(0.1, 0.2) = 0.2 to min(0.9, 0.95) = 0.9
    expect(result.lowerBound).toBeCloseTo(0.2)
    expect(result.upperBound).toBeCloseTo(0.9)
  })

  it('should identify treated units outside common support', () => {
    const result = computeCommonSupport(scores, treatment)
    // Treated score 0.1 is below lower bound 0.2
    expect(result.treatedOutside).toBe(1)
    expect(result.treatedOutsideIndices).toContain(0) // index 0 has score 0.1
  })

  it('should identify control units outside common support', () => {
    const result = computeCommonSupport(scores, treatment)
    // Control score 0.95 is above upper bound 0.9
    expect(result.controlOutside).toBe(1)
    expect(result.controlOutsideIndices).toContain(9) // index 9 has score 0.95
  })

  it('should count in-support and out-of-support correctly', () => {
    const result = computeCommonSupport(scores, treatment)
    expect(result.outOfSupport).toBe(2)
    expect(result.inSupport).toBe(8)
  })

  it('should return safe defaults when one group is empty', () => {
    const allTreated = [0.3, 0.5, 0.7]
    const treatmentAll = [1, 1, 1]
    const result = computeCommonSupport(allTreated, treatmentAll)
    expect(result.lowerBound).toBe(0)
    expect(result.upperBound).toBe(1)
    expect(result.outOfSupport).toBe(0)
  })

  it('should return correct support when distributions fully overlap', () => {
    const s = [0.2, 0.5, 0.8, 0.2, 0.5, 0.8]
    const t = [1, 1, 1, 0, 0, 0]
    const result = computeCommonSupport(s, t)
    expect(result.lowerBound).toBeCloseTo(0.2)
    expect(result.upperBound).toBeCloseTo(0.8)
    expect(result.outOfSupport).toBe(0)
  })
})

describe('trimToCommonSupport', () => {
  it('should return indices within support bounds', () => {
    const scores = [0.1, 0.3, 0.5, 0.7, 0.9]
    const support = {
      lowerBound: 0.2,
      upperBound: 0.8,
      treatedOutside: 0,
      controlOutside: 0,
      inSupport: 3,
      outOfSupport: 2,
      treatedOutsideIndices: [],
      controlOutsideIndices: [],
    }
    const indices = trimToCommonSupport(scores, support)
    // 0.3, 0.5, 0.7 are in [0.2, 0.8]
    expect(indices).toEqual([1, 2, 3])
    expect(indices).not.toContain(0) // 0.1 below bound
    expect(indices).not.toContain(4) // 0.9 above bound
  })
})
