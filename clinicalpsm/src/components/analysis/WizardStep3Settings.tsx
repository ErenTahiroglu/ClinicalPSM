'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PsmConfig } from '@/lib/psm/types'

interface Props {
  onComplete: (config: Pick<PsmConfig, 'ratio' | 'caliper' | 'withReplacement'>) => void
  onBack: () => void
}

const RATIOS: { value: PsmConfig['ratio']; label: string; hint: string }[] = [
  { value: 1, label: '1:1', hint: '1 control per treated subject (recommended)' },
  { value: 2, label: '1:2', hint: '2 controls per treated subject' },
  { value: 3, label: '1:3', hint: '3 controls per treated subject' },
]

export function WizardStep3Settings({ onComplete, onBack }: Props) {
  const [ratio, setRatio] = useState<PsmConfig['ratio']>(1)
  const [caliperStr, setCaliperStr] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleNext() {
    setError(null)
    let caliper: number | null = null

    if (caliperStr.trim() !== '') {
      const parsed = parseFloat(caliperStr)
      if (isNaN(parsed) || parsed <= 0) {
        setError('Caliper must be a positive number.')
        return
      }
      caliper = parsed
    }

    onComplete({ ratio, caliper, withReplacement: false })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Step 3: Matching settings</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a matching ratio and an optional caliper to limit maximum
          propensity score distance.
        </p>
      </div>

      {/* Ratio */}
      <div className="flex flex-col gap-2">
        <Label>Matching ratio</Label>
        <div className="flex flex-col gap-2">
          {RATIOS.map(({ value, label, hint }) => (
            <label key={value} className="flex cursor-pointer items-start gap-2.5 text-sm">
              <input
                type="radio"
                name="ratio"
                value={value}
                checked={ratio === value}
                onChange={() => setRatio(value)}
                className="mt-0.5 accent-primary"
              />
              <span>
                <span className="font-medium">{label}</span>
                <span className="ml-1.5 text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Caliper */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="caliper">
          Caliper{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="caliper"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 0.05 (recommended: 0.2 × SD of logit PS)"
          value={caliperStr}
          onChange={e => setCaliperStr(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          Recommended: 0.2 × SD of propensity score. Leave blank for no caliper.
        </p>
      </div>

      {/* Always without replacement in MVP */}
      <p className="text-xs text-muted-foreground">
        Matching is performed <strong>without replacement</strong> (each control
        unit can only be matched once).
      </p>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleNext}>Run Analysis →</Button>
      </div>
    </div>
  )
}
