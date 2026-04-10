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
  const fmt = (n: number) => (isNaN(n) ? '0.0000' : n.toFixed(4))
  const rows = balanceTable.map(row => [
    row.covariate,
    fmt(row.meanTreated),
    fmt(row.meanControl),
    fmt(row.sdPooled),
    fmt(row.smdBefore),
    fmt(row.smdAfter),
    fmt(row.varianceRatioBefore),
    fmt(row.varianceRatioAfter),
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
