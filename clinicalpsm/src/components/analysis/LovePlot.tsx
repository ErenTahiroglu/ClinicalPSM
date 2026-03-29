'use client'

import type { BalanceRow } from '@/lib/psm/types'

interface LovePlotProps {
  balanceTable: BalanceRow[]
}

const MARGIN = { left: 140, right: 30, top: 40, bottom: 40 }
const ROW_HEIGHT = 28
const AXIS_TICKS = [-0.5, -0.2, -0.1, 0, 0.1, 0.2, 0.5]

export function LovePlot({ balanceTable }: LovePlotProps) {
  const maxAbsSmd = Math.max(
    0.5,
    ...balanceTable.flatMap(r => [Math.abs(r.smdBefore), Math.abs(r.smdAfter)])
  )
  const xMin = -maxAbsSmd
  const xMax = maxAbsSmd

  const plotWidth = 400
  const plotHeight = balanceTable.length * ROW_HEIGHT
  const svgWidth = MARGIN.left + plotWidth + MARGIN.right
  const svgHeight = MARGIN.top + plotHeight + MARGIN.bottom

  const toX = (smd: number) =>
    MARGIN.left + ((smd - xMin) / (xMax - xMin)) * plotWidth

  const zero = toX(0)
  const negThreshold = toX(-0.1)
  const posThreshold = toX(0.1)

  return (
    <div className="overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        aria-label="Love plot: SMD before and after matching"
      >
        {/* Title */}
        <text
          x={svgWidth / 2}
          y={16}
          textAnchor="middle"
          className="fill-foreground text-xs font-medium"
          fontSize={12}
        >
          Standardized Mean Differences Before and After Matching
        </text>

        {/* Legend */}
        <circle cx={MARGIN.left + 10} cy={30} r={4} fill="#ef4444" />
        <text x={MARGIN.left + 18} y={34} fontSize={10} fill="#6b7280">
          Before
        </text>
        <circle
          cx={MARGIN.left + 70}
          cy={30}
          r={4}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={1.5}
        />
        <text x={MARGIN.left + 78} y={34} fontSize={10} fill="#6b7280">
          After
        </text>

        {/* Zero line */}
        <line
          x1={zero}
          y1={MARGIN.top}
          x2={zero}
          y2={MARGIN.top + plotHeight}
          stroke="#9ca3af"
          strokeDasharray="4,2"
          strokeWidth={1}
        />

        {/* ±0.1 threshold lines */}
        {[negThreshold, posThreshold].map(x => (
          <line
            key={x}
            x1={x}
            y1={MARGIN.top}
            x2={x}
            y2={MARGIN.top + plotHeight}
            stroke="#d1d5db"
            strokeDasharray="3,3"
            strokeWidth={1}
          />
        ))}

        {/* Axis ticks */}
        {AXIS_TICKS.filter(t => t >= xMin && t <= xMax).map(tick => (
          <g key={tick}>
            <line
              x1={toX(tick)}
              y1={MARGIN.top + plotHeight}
              x2={toX(tick)}
              y2={MARGIN.top + plotHeight + 4}
              stroke="#9ca3af"
              strokeWidth={1}
            />
            <text
              x={toX(tick)}
              y={MARGIN.top + plotHeight + 14}
              textAnchor="middle"
              fontSize={9}
              fill="#9ca3af"
            >
              {tick}
            </text>
          </g>
        ))}

        {/* X axis label */}
        <text
          x={MARGIN.left + plotWidth / 2}
          y={svgHeight - 4}
          textAnchor="middle"
          fontSize={10}
          fill="#6b7280"
        >
          Standardized Mean Difference
        </text>

        {/* Rows */}
        {balanceTable.map((row, i) => {
          const y = MARGIN.top + i * ROW_HEIGHT + ROW_HEIGHT / 2
          return (
            <g key={row.covariate}>
              {/* Covariate label */}
              <text
                x={MARGIN.left - 8}
                y={y + 4}
                textAnchor="end"
                fontSize={10}
                fill="#374151"
              >
                {row.covariate.length > 18
                  ? row.covariate.slice(0, 17) + '…'
                  : row.covariate}
              </text>

              {/* Before dot (filled red) */}
              <circle cx={toX(row.smdBefore)} cy={y} r={4} fill="#ef4444" />

              {/* After dot (hollow blue) */}
              <circle
                cx={toX(row.smdAfter)}
                cy={y}
                r={4}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={1.5}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
