'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ButtonLink } from '@/components/ui/button-link'
import { downloadBalanceTable } from '@/lib/export/balance-table'
import type { Analysis } from '@/types/database'

interface Props {
  analysis: Analysis
}

export function AnalysisDetailExport({ analysis }: Props) {
  if (!analysis.result_summary) return null

  function handleBalanceTable() {
    downloadBalanceTable(analysis.result_summary!.balanceTable, analysis.id)
  }

  return (
    <section>
      <h2 className="mb-3 font-semibold">Export</h2>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" onClick={handleBalanceTable}>
          Download Balance Table (CSV)
        </Button>
        <ButtonLink
          href={`/analyses/${analysis.id}/print`}
          variant="outline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Export PDF (Print view)
        </ButtonLink>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        To download the matched dataset and Love plot PNG, re-run the analysis from{' '}
        <Link href="/new" className="underline hover:text-foreground">
          New Analysis
        </Link>
        .
      </p>
    </section>
  )
}
