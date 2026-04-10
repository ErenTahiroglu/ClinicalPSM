'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { Analysis } from '@/types/database'

interface Props {
  analysis: Analysis
}

export function AnalysisResultDetail({ analysis }: Props) {
  const [open, setOpen] = useState(false)

  if (analysis.status !== 'completed' || !analysis.result_summary) return null

  const r = analysis.result_summary

  return (
    <div className="border-t px-4 pb-3 pt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {open ? 'Hide results' : 'View results'}
      </button>

      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {[
            { label: 'Treated', value: r.nTreated },
            { label: 'Control', value: r.nControl },
            { label: 'Matched pairs', value: r.nMatched },
            { label: 'Mean |SMD| before', value: r.overallSmdBefore.toFixed(3) },
            { label: 'Mean |SMD| after', value: r.overallSmdAfter.toFixed(3) },
            { label: 'Converged', value: r.converged ? 'Yes' : 'No' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-md border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-0.5 text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
