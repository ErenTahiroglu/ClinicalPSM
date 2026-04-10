'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  onComplete: (data: { name: string; description: string }) => void
}

export function WizardStep1Info({ onComplete }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  function handleNext() {
    setError(null)
    if (!name.trim()) {
      setError('Analysis name is required.')
      return
    }
    onComplete({ name: name.trim(), description: description.trim() })
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Step 1: Analysis information</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Give your analysis a name so you can find it later.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="analysis-name">Analysis name</Label>
          <Input
            id="analysis-name"
            name="name"
            type="text"
            placeholder="e.g. Treatment effect on blood pressure"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="analysis-description">
            Description{' '}
            <span className="font-normal text-muted-foreground">(optional)</span>
          </Label>
          <textarea
            id="analysis-description"
            name="description"
            placeholder="Brief description of your study or dataset"
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={handleNext}>Next →</Button>
      </div>
    </div>
  )
}
