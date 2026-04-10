'use client'

import { useState } from 'react'
import { WizardStep1Info } from './WizardStep1Info'
import { WizardStep1Upload } from './WizardStep1Upload'
import { WizardStep2Variables } from './WizardStep2Variables'
import { WizardStep3Settings } from './WizardStep3Settings'
import { WizardStep4Results } from './WizardStep4Results'
import type { PsmConfig } from '@/lib/psm/types'
import type { RawRow } from '@/lib/psm/encoding'
import type { ImputationStrategy } from '@/lib/psm/imputation'
import { imputeData } from '@/lib/psm/imputation'

type WizardStep = 1 | 2 | 3 | 4 | 5

interface WizardState {
  step: WizardStep
  // Step 1 — Info
  name: string
  description: string
  // Step 2 — Upload
  rawData: RawRow[]
  columns: string[]
  rowCount: number
  fileName: string
  analysisId: string
  uploadId: string
  // Step 3 — Variables
  treatmentColumn: string
  outcomeColumn: string
  covariates: string[]
  imputationStrategy: ImputationStrategy
  // Step 4 — Settings
  method: 'nearest' | 'optimal'
  ratio: PsmConfig['ratio']
  caliper: number | null
}

const INITIAL_STATE: WizardState = {
  step: 1,
  name: '',
  description: '',
  rawData: [],
  columns: [],
  rowCount: 0,
  fileName: '',
  analysisId: '',
  uploadId: '',
  treatmentColumn: '',
  outcomeColumn: '',
  covariates: [],
  imputationStrategy: 'mean',
  method: 'nearest',
  ratio: 1,
  caliper: null,
}

const STEP_LABELS = [
  'Analysis Info',
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

  const imputedData =
    state.rawData.length > 0 && state.covariates.length > 0
      ? imputeData(state.rawData, state.covariates, state.imputationStrategy)
      : state.rawData

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
      {state.step === 1 && (
        <WizardStep1Info
          onComplete={({ name, description }) => {
            setState(prev => ({ ...prev, name, description, step: 2 }))
          }}
        />
      )}

      {state.step === 2 && (
        <WizardStep1Upload
          name={state.name}
          onComplete={({ rawData, columns, rowCount, fileName, analysisId, uploadId }) => {
            setState(prev => ({
              ...prev,
              rawData,
              columns,
              rowCount,
              fileName,
              analysisId,
              uploadId,
              step: 3,
            }))
          }}
          onBack={() => goTo(1)}
        />
      )}

      {state.step === 3 && (
        <WizardStep2Variables
          columns={state.columns}
          rawData={state.rawData}
          onComplete={({ treatmentColumn, outcomeColumn, covariates, imputationStrategy }) => {
            setState(prev => ({
              ...prev,
              treatmentColumn,
              outcomeColumn,
              covariates,
              imputationStrategy,
              step: 4,
            }))
          }}
          onBack={() => goTo(2)}
        />
      )}

      {state.step === 4 && (
        <WizardStep3Settings
          onComplete={({ method, ratio, caliper }) => {
            setState(prev => ({ ...prev, method, ratio, caliper, step: 5 }))
          }}
          onBack={() => goTo(3)}
        />
      )}

      {state.step === 5 && (
        <WizardStep4Results
          rawData={imputedData}
          columns={state.columns}
          config={psmConfig}
          analysisId={state.analysisId}
          treatmentColumn={state.treatmentColumn}
          outcomeColumn={state.outcomeColumn}
          covariates={state.covariates}
          method={state.method}
          onBack={() => goTo(4)}
        />
      )}
    </div>
  )
}
