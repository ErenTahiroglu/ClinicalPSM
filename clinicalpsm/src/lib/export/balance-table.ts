import type { BalanceRow } from '@/lib/psm/types'
import { downloadCsv } from './csv'

export function buildBalanceTableCsv(balanceTable: BalanceRow[]): string {
  const header = [
    'Covariate',
    'Mean (Treated)',
    'Mean (Control)',
    'SD Pooled',
    'SMD Before',
    'SMD After',
    'Variance Ratio Before',
    'Variance Ratio After',
  ]
  const rows = balanceTable.map(row => [
    row.covariate,
    row.meanTreated.toFixed(4),
    row.meanControl.toFixed(4),
    row.sdPooled.toFixed(4),
    row.smdBefore.toFixed(4),
    row.smdAfter.toFixed(4),
    row.varianceRatioBefore.toFixed(4),
    row.varianceRatioAfter.toFixed(4),
  ])
  return [header, ...rows].map(r => r.join(',')).join('\n')
}

export function downloadBalanceTable(balanceTable: BalanceRow[], analysisId: string): void {
  const csv = buildBalanceTableCsv(balanceTable)
  downloadCsv(csv, `balance_table_${analysisId.slice(0, 8)}.csv`)
}
