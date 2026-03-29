'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { DataRow } from '@/lib/psm/types'

interface Props {
  columns: string[]
  rawData: DataRow[]
  onComplete: (result: { treatmentColumn: string; covariates: string[] }) => void
  onBack: () => void
}

function isBinaryColumn(data: DataRow[], col: string): boolean {
  const values = new Set(data.map(r => r[col]))
  return (
    values.size <= 2 &&
    [...values].every(v => v === 0 || v === 1)
  )
}

export function WizardStep2Variables({ columns, rawData, onComplete, onBack }: Props) {
  const [treatmentColumn, setTreatmentColumn] = useState('')
  const [covariates, setCovariates] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  const availableColumns = treatmentColumn
    ? columns.filter(c => c !== treatmentColumn)
    : columns

  function toggleCovariate(col: string) {
    setCovariates(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    )
  }

  function handleNext() {
    setError(null)
    if (!treatmentColumn) {
      setError('Please select a treatment variable.')
      return
    }
    if (!isBinaryColumn(rawData, treatmentColumn)) {
      setError(
        `Column "${treatmentColumn}" does not appear to be binary (0/1). Please choose a different treatment variable.`
      )
      return
    }
    if (covariates.length === 0) {
      setError('Please select at least one covariate.')
      return
    }
    onComplete({ treatmentColumn, covariates })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Step 2: Select variables</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your treatment indicator (must be 0/1) and the covariates to
          include in the propensity score model.
        </p>
      </div>

      {/* Treatment column */}
      <div className="flex flex-col gap-2">
        <Label>Treatment variable (binary: 0 = control, 1 = treated)</Label>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={treatmentColumn}
          onChange={e => {
            setTreatmentColumn(e.target.value)
            setCovariates(prev => prev.filter(c => c !== e.target.value))
          }}
        >
          <option value="">— select column —</option>
          {columns.map(col => (
            <option key={col} value={col}>
              {col}
              {isBinaryColumn(rawData, col) ? ' ✓' : ''}
            </option>
          ))}
        </select>
        {treatmentColumn && !isBinaryColumn(rawData, treatmentColumn) && (
          <p className="text-xs text-amber-600">
            Warning: this column does not appear to contain only 0 and 1 values.
          </p>
        )}
      </div>

      {/* Covariates */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>
            Covariates{' '}
            <span className="font-normal text-muted-foreground">
              (select all that may confound treatment assignment)
            </span>
          </Label>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setCovariates(availableColumns)}
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              Select all
            </button>
            <span className="text-muted-foreground">·</span>
            <button
              type="button"
              onClick={() => setCovariates([])}
              className="text-muted-foreground underline-offset-2 hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto rounded-md border p-3">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {availableColumns.map(col => (
              <label key={col} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={covariates.includes(col)}
                  onChange={() => toggleCovariate(col)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="truncate">{col}</span>
              </label>
            ))}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {covariates.length} covariate{covariates.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleNext}>Next →</Button>
      </div>
    </div>
  )
}
