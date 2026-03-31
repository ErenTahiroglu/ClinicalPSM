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
  const escapeCell = (cell: string) => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
      return `"${cell.replace(/"/g, '""')}"`
    }
    return cell
  }
  return [header, ...rows].map(r => r.map(escapeCell).join(',')).join('\n')
}

/* c8 ignore next 4 — browser-only: delegates to downloadCsv which requires DOM */
export function downloadBalanceTable(balanceTable: BalanceRow[], analysisId: string): void {
  const csv = buildBalanceTableCsv(balanceTable)
  downloadCsv(csv, `balance_table_${analysisId.slice(0, 8)}.csv`)
}
