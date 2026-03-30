'use client'

import type { MatchedPair } from '@/lib/psm/types'

interface Props {
  scores: number[]
  treatment: number[]
  matchedPairs: MatchedPair[]
}

const BINS = 20
const MARGIN = { left: 40, right: 20, top: 36, bottom: 40 }
const PLOT_WIDTH = 380
const PLOT_HEIGHT = 140

function buildHistogram(values: number[], bins: number): number[] {
  const counts = new Array<number>(bins).fill(0)
  for (const v of values) {
    const bin = Math.min(Math.floor(v * bins), bins - 1)
    counts[bin]++
  }
  return counts
}

export function PropensityHistogram({ scores, treatment, matchedPairs }: Props) {
  const treatedScores = scores.filter((_, i) => treatment[i] === 1)
  const controlScores = scores.filter((_, i) => treatment[i] === 0)

  const matchedTreatedIdx = new Set(matchedPairs.map(p => p.treatedIndex))
  const matchedControlIdx = new Set(matchedPairs.map(p => p.controlIndex))
  const matchedTreatedScores = scores.filter((_, i) => matchedTreatedIdx.has(i))
  const matchedControlScores = scores.filter((_, i) => matchedControlIdx.has(i))

  const datasets = [
    { label: 'Treated (before)', counts: buildHistogram(treatedScores, BINS), color: '#ef4444', opacity: 0.6 },
    { label: 'Control (before)', counts: buildHistogram(controlScores, BINS), color: '#3b82f6', opacity: 0.6 },
    { label: 'Treated (after)', counts: buildHistogram(matchedTreatedScores, BINS), color: '#dc2626', opacity: 1 },
    { label: 'Control (after)', counts: buildHistogram(matchedControlScores, BINS), color: '#1d4ed8', opacity: 1 },
  ]

  const maxCount = Math.max(1, ...datasets.flatMap(d => d.counts))
  const svgWidth = MARGIN.left + PLOT_WIDTH + MARGIN.right
  const svgHeight = MARGIN.top + PLOT_HEIGHT + MARGIN.bottom
  const barWidth = PLOT_WIDTH / BINS

  const toY = (count: number) => MARGIN.top + PLOT_HEIGHT - (count / maxCount) * PLOT_HEIGHT

  // X-axis tick values: 0, 0.25, 0.5, 0.75, 1
  const xTicks = [0, 0.25, 0.5, 0.75, 1]

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        aria-label="Propensity score distribution before and after matching"
      >
        {/* Title */}
        <text x={svgWidth / 2} y={14} textAnchor="middle" fontSize={11} fontWeight={500} fill="#374151">
          Propensity Score Distribution
        </text>

        {/* Legend */}
        {[
          { color: '#ef4444', label: 'Treated before', opacity: 0.6 },
          { color: '#3b82f6', label: 'Control before', opacity: 0.6 },
          { color: '#dc2626', label: 'Treated after', opacity: 1 },
          { color: '#1d4ed8', label: 'Control after', opacity: 1 },
        ].map((item, i) => (
          <g key={item.label} transform={`translate(${MARGIN.left + i * 90}, 25)`}>
            <rect width={10} height={10} fill={item.color} opacity={item.opacity} rx={2} />
            <text x={14} y={9} fontSize={9} fill="#6b7280">{item.label}</text>
          </g>
        ))}

        {/* Bars */}
        {datasets.map(({ counts, color, opacity }) =>
          counts.map((count, binIdx) => {
            const x = MARGIN.left + binIdx * barWidth
            const y = toY(count)
            const height = MARGIN.top + PLOT_HEIGHT - y
            return (
              <rect
                key={`${color}-${binIdx}`}
                x={x + 1}
                y={y}
                width={barWidth - 2}
                height={height}
                fill={color}
                opacity={opacity * 0.5}
              />
            )
          })
        )}

        {/* X-axis line */}
        <line
          x1={MARGIN.left}
          y1={MARGIN.top + PLOT_HEIGHT}
          x2={MARGIN.left + PLOT_WIDTH}
          y2={MARGIN.top + PLOT_HEIGHT}
          stroke="#d1d5db"
          strokeWidth={1}
        />

        {/* X-axis ticks */}
        {xTicks.map(tick => {
          const x = MARGIN.left + tick * PLOT_WIDTH
          return (
            <g key={tick}>
              <line
                x1={x} y1={MARGIN.top + PLOT_HEIGHT}
                x2={x} y2={MARGIN.top + PLOT_HEIGHT + 4}
                stroke="#9ca3af" strokeWidth={1}
              />
              <text x={x} y={MARGIN.top + PLOT_HEIGHT + 14} textAnchor="middle" fontSize={9} fill="#9ca3af">
                {tick}
              </text>
            </g>
          )
        })}

        {/* X-axis label */}
        <text
          x={MARGIN.left + PLOT_WIDTH / 2}
          y={svgHeight - 4}
          textAnchor="middle"
          fontSize={10}
          fill="#6b7280"
        >
          Propensity Score
        </text>
      </svg>
    </div>
  )
}
