import type { MatchedPair } from '@/lib/psm/types'
import type { RawRow } from '@/lib/psm/encoding'

export function buildMatchedCsv(
  data: RawRow[],
  pairs: MatchedPair[],
  columns: string[]
): string {
  const header = ['_matched_pair_id', '_role', ...columns]
  const rows: string[][] = [header]

  pairs.forEach((pair, pairIndex) => {
    const pairId = String(pairIndex + 1)

    const treatedRow = data[pair.treatedIndex]
    rows.push([pairId, 'treated', ...columns.map(col => String(treatedRow[col] ?? ''))])

    const controlRow = data[pair.controlIndex]
    rows.push([pairId, 'control', ...columns.map(col => String(controlRow[col] ?? ''))])
  })

  const escapeCell = (cell: string) => {
    if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
      return `"${cell.replace(/"/g, '""')}"`
    }
    return cell
  }
  return rows.map(row => row.map(escapeCell).join(',')).join('\n')
}

/* c8 ignore next 9 — browser-only: requires DOM Blob, URL.createObjectURL, anchor click */
export function downloadCsv(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
