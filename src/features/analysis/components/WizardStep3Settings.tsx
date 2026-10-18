'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PsmConfig } from '@/lib/psm/types'

interface Props {
  onComplete: (config: Pick<PsmConfig, 'ratio' | 'caliper' | 'withReplacement'> & { method: 'nearest' | 'optimal' }) => void
  onBack: () => void
}

export function WizardStep3Settings({ onComplete, onBack }: Props) {
  const [method, setMethod] = useState<'nearest' | 'optimal'>('nearest')
  const [ratioStr, setRatioStr] = useState('1')
  const [caliperStr, setCaliperStr] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleNext() {
    setError(null)

    if (method !== 'nearest') {
      setError('Optimal matching is not available. Use nearest neighbor.')
      return
    }

    const ratioNum = parseInt(ratioStr, 10)
    if (isNaN(ratioNum) || ratioNum < 1 || ratioNum > 3) {
      setError('Matching ratio must be between 1 and 3.')
      return
    }

    let caliper: number | null = null
    if (caliperStr.trim() !== '') {
      const parsed = parseFloat(caliperStr)
      if (isNaN(parsed) || parsed <= 0) {
        setError('Caliper must be a positive number.')
        return
      }
      caliper = parsed
    }

    onComplete({
      method,
      ratio: ratioNum as PsmConfig['ratio'],
      caliper,
      withReplacement: false,
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Matching Configuration</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose a matching ratio and an optional caliper to limit the maximum
          propensity score distance.
        </p>
      </div>

      {/* Matching method */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="method-select">Matching method</Label>
        <select
          id="method-select"
          name="method"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm max-w-xs"
          value={method}
          onChange={e => setMethod(e.target.value as 'nearest' | 'optimal')}
        >
          <option value="nearest">Nearest neighbor (greedy)</option>
          <option value="optimal" disabled>
            Optimal matching (not available)
          </option>
        </select>
        <p className="text-xs text-muted-foreground">
          Only greedy nearest-neighbor matching is currently available. Optimal matching is not yet validated and is disabled.
        </p>
      </div>

      {/* Matching ratio */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="ratio-input">Matching ratio (controls per treated)</Label>
        <Input
          id="ratio-input"
          name="ratio"
          type="number"
          min="1"
          max="3"
          step="1"
          value={ratioStr}
          onChange={e => setRatioStr(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          1 = 1:1 matching (recommended), 2 = 1:2, 3 = 1:3
        </p>
      </div>

      {/* Caliper */}
      <div className="flex flex-col gap-2">
        <Label htmlFor="caliper-input">
          Caliper{' '}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="caliper-input"
          name="caliper"
          type="number"
          min="0"
          step="0.01"
          placeholder="e.g. 0.05 (max propensity score difference)"
          value={caliperStr}
          onChange={e => setCaliperStr(e.target.value)}
          className="max-w-xs"
        />
        <p className="text-xs text-muted-foreground">
          The caliper is the maximum allowed absolute difference in propensity score (probability scale, 0–1), not a multiple of an SD. Leave blank for no caliper.
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
        <Button onClick={handleNext}>Next →</Button>
      </div>
    </div>
  )
}
