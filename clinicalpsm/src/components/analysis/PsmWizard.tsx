'use client'

import { useState } from 'react'
import { WizardStep1Upload } from './WizardStep1Upload'
import { WizardStep2Variables } from './WizardStep2Variables'
import { WizardStep3Settings } from './WizardStep3Settings'
import { WizardStep4Results } from './WizardStep4Results'
import type { DataRow, PsmConfig } from '@/lib/psm/types'

type WizardStep = 1 | 2 | 3 | 4

interface WizardState {
  step: WizardStep
  // Step 1
  rawData: DataRow[]
  columns: string[]
  rowCount: number
  fileName: string
  analysisId: string
  uploadId: string
  // Step 2
  treatmentColumn: string
  covariates: string[]
  // Step 3
  ratio: PsmConfig['ratio']
  caliper: number | null
}

const INITIAL_STATE: WizardState = {
  step: 1,
  rawData: [],
  columns: [],
  rowCount: 0,
  fileName: '',
  analysisId: '',
  uploadId: '',
  treatmentColumn: '',
  covariates: [],
  ratio: 1,
  caliper: null,
}

const STEP_LABELS = [
  'Upload CSV',
  'Select Variables',
  'Settings',
  'Results',
]

export function PsmWizard() {
  const [state, setState] = useState<WizardState>(INITIAL_STATE)

  function goTo(step: WizardStep) {
    setState(prev => ({ ...prev, step }))
  }

  const psmConfig: PsmConfig = {
    treatmentColumn: state.treatmentColumn,
    covariates: state.covariates,
    ratio: state.ratio,
    caliper: state.caliper,
    withReplacement: false,
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* Step indicator */}
      <nav className="mb-8 flex items-center gap-2">
        {STEP_LABELS.map((label, idx) => {
          const stepNum = (idx + 1) as WizardStep
          const isActive = state.step === stepNum
          const isDone = state.step > stepNum
          return (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isDone
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {stepNum}
              </span>
              <span
                className={`hidden text-sm sm:inline ${isActive ? 'font-medium' : 'text-muted-foreground'}`}
              >
                {label}
              </span>
              {idx < STEP_LABELS.length - 1 && (
                <span className="mx-1 text-muted-foreground">›</span>
              )}
            </div>
          )
        })}
      </nav>

      {/* Step content */}
      <div className="rounded-lg border bg-card p-6 shadow-sm">
        {state.step === 1 && (
          <WizardStep1Upload
            onComplete={data =>
              setState(prev => ({ ...prev, ...data, step: 2 }))
            }
          />
        )}

        {state.step === 2 && (
          <WizardStep2Variables
            columns={state.columns}
            rawData={state.rawData}
            onComplete={data =>
              setState(prev => ({ ...prev, ...data, step: 3 }))
            }
            onBack={() => goTo(1)}
          />
        )}

        {state.step === 3 && (
          <WizardStep3Settings
            onComplete={data =>
              setState(prev => ({ ...prev, ...data, step: 4 }))
            }
            onBack={() => goTo(2)}
          />
        )}

        {state.step === 4 && (
          <WizardStep4Results
            rawData={state.rawData}
            columns={state.columns}
            config={psmConfig}
            analysisId={state.analysisId}
            onBack={() => goTo(3)}
          />
        )}
      </div>
    </div>
  )
}
