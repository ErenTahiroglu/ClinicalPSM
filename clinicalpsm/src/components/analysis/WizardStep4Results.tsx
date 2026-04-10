'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { LovePlot } from './LovePlot'
import { PropensityHistogram } from './PropensityHistogram'
import { runPsmInWorker } from '@/lib/psm/run-psm-in-worker'
import { buildMatchedCsv, downloadCsv } from '@/lib/export/csv'
import { downloadBalanceTable } from '@/lib/export/balance-table'
import { downloadSvgAsPng } from '@/lib/export/svg-to-png'
import { PsmError } from '@/lib/psm/types'
import type { PsmConfig, PsmResult } from '@/lib/psm/types'
import type { RawRow } from '@/lib/psm/encoding'
import { useToast } from '@/components/shared/ToastProvider'
import { getCsrfTokenFromCookie } from '@/lib/csrf-client'

interface Props {
  rawData: RawRow[]
  columns: string[]
  config: PsmConfig
  analysisId: string
  treatmentColumn: string
  outcomeColumn: string
  covariates: string[]
  method: 'nearest' | 'optimal'
  onBack: () => void
}

const PSM_ERROR_MESSAGES: Record<string, string> = {
  INSUFFICIENT_SAMPLE:
    'Not enough subjects in treated or control group (minimum 10 each).',
  NO_VARIANCE: 'One of the covariates has zero variance — remove it and try again.',
  TREATMENT_NOT_BINARY:
    'The treatment column must contain only 0 and 1 values.',
  MISSING_VALUES:
    'Missing values detected. Please clean your dataset before running the analysis.',
  CONVERGENCE_FAILURE:
    'The logistic regression did not converge. Try standardizing your covariates or removing highly correlated variables.',
  NO_MATCHES:
    'No matched pairs could be formed. If you specified a caliper, try increasing it or removing it.',
  TIMEOUT:
    'The analysis timed out. Try reducing the dataset size or removing covariates.',
}

export function WizardStep4Results({
  rawData,
  columns,
  config,
  analysisId,
  treatmentColumn,
  outcomeColumn,
  covariates,
  method,
  onBack,
}: Props) {
  const [result, setResult] = useState<PsmResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const lovePlotRef = useRef<SVGSVGElement>(null)
  const { toast } = useToast()

  async function handleRun() {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const psmResult = await runPsmInWorker(rawData, config)

      setResult(psmResult)
      setIsRunning(false)

      // Save to DB
      setIsSaving(true)
      const res = await fetch(`/api/analyses/${analysisId}/results`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfTokenFromCookie() ?? ''
        },
        body: JSON.stringify({ resultSummary: psmResult, config }),
      })
      if (res.ok) {
        setSaved(true)
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Analysis ran successfully but could not be saved to your dashboard.')
      }
    } catch (err) {
      setIsRunning(false)
      if (err instanceof PsmError) {
        setError(PSM_ERROR_MESSAGES[err.code] ?? err.message)
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const csv = buildMatchedCsv(rawData, result.matchedPairs, columns)
    downloadCsv(csv, `matched_dataset_${analysisId.slice(0, 8)}.csv`)
    toast('Matched CSV downloaded.', 'success')
  }

  function handleDownloadBalanceTable() {
    if (!result) return
    downloadBalanceTable(result.balanceTable, analysisId)
    toast('Balance table downloaded.', 'success')
  }

  function handleDownloadLovePlot() {
    if (!lovePlotRef.current) return
    downloadSvgAsPng(lovePlotRef.current, `love_plot_${analysisId.slice(0, 8)}.png`)
    toast('Love plot PNG downloaded.', 'success')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Review &amp; Run Analysis</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Review your configuration and run the propensity score matching.
        </p>
      </div>

      {/* Configuration summary */}
      {!result && (
        <div className="rounded-lg border p-4 flex flex-col gap-3 text-sm">
          <div className="flex gap-2">
            <span className="font-medium w-32 shrink-0">Treatment:</span>
            <span className="text-muted-foreground">{treatmentColumn}</span>
          </div>
          {outcomeColumn && (
            <div className="flex gap-2">
              <span className="font-medium w-32 shrink-0">Outcome:</span>
              <span className="text-muted-foreground">{outcomeColumn}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-medium w-32 shrink-0">Covariates:</span>
            <span className="text-muted-foreground">{covariates.join(', ')}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-32 shrink-0">Method:</span>
            <span className="text-muted-foreground">{method === 'nearest' ? 'Nearest neighbor' : 'Optimal'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-medium w-32 shrink-0">Ratio:</span>
            <span className="text-muted-foreground">1:{config.ratio}</span>
          </div>
          {config.caliper !== null && (
            <div className="flex gap-2">
              <span className="font-medium w-32 shrink-0">Caliper:</span>
              <span className="text-muted-foreground">{config.caliper}</span>
            </div>
          )}
        </div>
      )}

      {!result && !isRunning && (
        <Button onClick={handleRun} className="self-start">
          Run Analysis
        </Button>
      )}

      {isRunning && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Computing propensity scores and matching…
        </div>
      )}

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {result && (
        <div className="flex flex-col gap-8">
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm font-medium text-green-700">
            Analysis completed — {result.nMatched} matched pairs formed.
          </p>

          {/* Summary stats */}
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Treated units', value: result.nTreated },
              { label: 'Control units', value: result.nControl },
              { label: 'Matched pairs', value: result.nMatched },
              {
                label: 'SMD before (mean |SMD|)',
                value: result.overallSmdBefore.toFixed(3),
              },
              {
                label: 'SMD after (mean |SMD|)',
                value: result.overallSmdAfter.toFixed(3),
              },
              {
                label: 'Convergence',
                value: result.converged ? 'Yes' : 'No (100 iter)',
              },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-semibold">{value}</p>
              </div>
            ))}
          </div>

          {/* Balance Diagnostics */}
          <div>
            <h3 className="mb-2 font-medium">Balance Diagnostics</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      'Covariate',
                      'Mean (Treated)',
                      'Mean (Control)',
                      'SMD Before',
                      'SMD After',
                      'VR Before',
                      'VR After',
                    ].map(h => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.balanceTable.map(row => (
                    <tr key={row.covariate} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{row.covariate}</td>
                      <td className="px-3 py-1.5">{row.meanTreated.toFixed(3)}</td>
                      <td className="px-3 py-1.5">{row.meanControl.toFixed(3)}</td>
                      <td
                        className={`px-3 py-1.5 ${Math.abs(row.smdBefore) > 0.1 ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {row.smdBefore.toFixed(3)}
                      </td>
                      <td
                        className={`px-3 py-1.5 font-medium ${Math.abs(row.smdAfter) > 0.1 ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {row.smdAfter.toFixed(3)}
                      </td>
                      <td className="px-3 py-1.5">{row.varianceRatioBefore.toFixed(3)}</td>
                      <td className="px-3 py-1.5">{row.varianceRatioAfter.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              |SMD| &lt; 0.1 indicates good balance (shown in green).
            </p>
          </div>

          {/* Propensity score distribution */}
          <div>
            <h3 className="mb-2 font-medium">Propensity Score Distribution</h3>
            <PropensityHistogram
              scores={result.propensityScores}
              treatment={rawData.map(r => r[config.treatmentColumn] as number)}
              matchedPairs={result.matchedPairs}
            />
          </div>

          {/* Love Plot */}
          <div>
            <h3 className="mb-2 font-medium">Love Plot</h3>
            <LovePlot ref={lovePlotRef} balanceTable={result.balanceTable} />
          </div>

          {/* Matched Dataset actions */}
          <div>
            <h3 className="mb-3 font-medium">Matched Dataset</h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleDownload} variant="outline">
                Export CSV
              </Button>
              <Button onClick={handleDownloadBalanceTable} variant="outline">
                Download Balance Table
              </Button>
              <Button onClick={handleDownloadLovePlot} variant="outline">
                Download Love Plot (PNG)
              </Button>
              {isSaving && (
                <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Saving…
                </span>
              )}
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-green-700">
                  ✓ Analysis saved —{' '}
                  <Link href="/analyses" className="underline hover:text-green-900">
                    Go to Dashboard →
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {!result && (
        <div className="flex justify-start">
          <Button variant="outline" onClick={onBack}>
            ← Back
          </Button>
        </div>
      )}
    </div>
  )
}
