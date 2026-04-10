'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { isCategoricalColumn } from '@/lib/psm/encoding'
import type { RawRow } from '@/lib/psm/encoding'
import { detectMissingValues } from '@/lib/psm/imputation'
import type { ImputationStrategy } from '@/lib/psm/imputation'

interface Props {
  columns: string[]
  rawData: RawRow[]
  onComplete: (result: {
    treatmentColumn: string
    outcomeColumn: string
    covariates: string[]
    imputationStrategy: ImputationStrategy
  }) => void
  onBack: () => void
}

function isBinaryColumn(data: RawRow[], col: string): boolean {
  const values = new Set(data.map(r => r[col]))
  return (
    values.size <= 2 &&
    [...values].every(v => v === 0 || v === 1)
  )
}

interface ColStats {
  n: number
  missing: number
  mean: number | null
  sd: number | null
}

function getColStats(data: RawRow[], col: string): ColStats {
  const all = data.map(r => r[col])
  const numeric = all.filter(v => v !== null && v !== undefined && !isNaN(Number(v))).map(Number)
  const missing = all.length - numeric.length
  if (numeric.length === 0) return { n: all.length, missing, mean: null, sd: null }
  const mean = numeric.reduce((a, b) => a + b, 0) / numeric.length
  const variance =
    numeric.length > 1
      ? numeric.reduce((a, b) => a + (b - mean) ** 2, 0) / (numeric.length - 1)
      : 0
  return { n: all.length, missing, mean, sd: Math.sqrt(variance) }
}

export function WizardStep2Variables({ columns, rawData, onComplete, onBack }: Props) {
  const [treatmentColumn, setTreatmentColumn] = useState('')
  const [outcomeColumn, setOutcomeColumn] = useState('')
  const [covariates, setCovariates] = useState<string[]>([])
  const [imputationStrategy, setImputationStrategy] = useState<ImputationStrategy>('mean')
  const [error, setError] = useState<string | null>(null)

  // Covariates exclude treatment and outcome columns
  const availableColumns = columns.filter(
    c => c !== treatmentColumn && c !== outcomeColumn
  )

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
    onComplete({ treatmentColumn, outcomeColumn, covariates, imputationStrategy })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Step 3: Select variables</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your treatment indicator (must be 0/1), outcome variable, and
          the covariates to include in the propensity score model.
        </p>
      </div>

      {/* Treatment column */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="treatment-select">
          Treatment variable{' '}
          <span className="font-normal text-muted-foreground">(binary: 0 = control, 1 = treated)</span>
        </Label>
        <select
          id="treatment-select"
          name="treatment"
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

      {/* Outcome column */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="outcome-select">
          Outcome variable{' '}
          <span className="font-normal text-muted-foreground">(optional — used for treatment effect estimation)</span>
        </Label>
        <select
          id="outcome-select"
          name="outcome"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={outcomeColumn}
          onChange={e => {
            setOutcomeColumn(e.target.value)
            setCovariates(prev => prev.filter(c => c !== e.target.value))
          }}
        >
          <option value="">— select column (optional) —</option>
          {columns
            .filter(c => c !== treatmentColumn)
            .map(col => (
              <option key={col} value={col}>
                {col}
              </option>
            ))}
        </select>
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
        <div className="max-h-72 overflow-x-auto overflow-y-auto rounded-md border">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-muted/70">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium text-muted-foreground">Column</th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Mean</th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">SD</th>
                <th scope="col" className="px-3 py-2 text-right font-medium text-muted-foreground">Missing</th>
              </tr>
            </thead>
            <tbody>
              {availableColumns.map(col => {
                const stats = getColStats(rawData, col)
                return (
                  <tr
                    key={col}
                    data-covariate={col}
                    onClick={() => toggleCovariate(col)}
                    aria-label={`${col} — click to ${covariates.includes(col) ? 'deselect' : 'select'} as covariate`}
                    className={`cursor-pointer border-t transition-colors ${
                      covariates.includes(col)
                        ? 'bg-primary/5'
                        : 'hover:bg-muted/40'
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={covariates.includes(col)}
                          onChange={() => toggleCovariate(col)}
                          onClick={e => e.stopPropagation()}
                          className="h-3.5 w-3.5 accent-primary"
                          aria-label={`Select ${col} as covariate`}
                        />
                        <span className="font-medium">{col}</span>
                        {isCategoricalColumn(rawData, col) && (
                          <span className="rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-700">
                            categorical
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {stats.mean !== null ? stats.mean.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right text-muted-foreground">
                      {stats.sd !== null ? stats.sd.toFixed(2) : '—'}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {stats.missing > 0 ? (
                        <span className="text-amber-600">{stats.missing}</span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          {covariates.length} covariate{covariates.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      {/* Missing value strategy */}
      {covariates.length > 0 && (() => {
        const missing = detectMissingValues(rawData, covariates)
        if (missing.length === 0) return null
        return (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-2 text-sm font-medium text-amber-800">
              Missing Values detected in {missing.length} covariate{missing.length > 1 ? 's' : ''}:
            </p>
            <ul className="mb-3 space-y-0.5 text-xs text-amber-700">
              {missing.map(m => (
                <li key={m.column}>
                  <strong>{m.column}</strong>: {m.missingCount} / {m.totalCount} rows
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-amber-800">Imputation Strategy:</label>
              <select
                name="imputation"
                value={imputationStrategy}
                onChange={e => setImputationStrategy(e.target.value as ImputationStrategy)}
                className="rounded border border-amber-300 bg-white px-2 py-1 text-xs"
              >
                <option value="mean">Impute with column mean</option>
                <option value="median">Impute with column median</option>
                <option value="mode">Impute with column mode</option>
                <option value="drop">Drop rows with missing values</option>
              </select>
            </div>
          </div>
        )
      })()}

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
