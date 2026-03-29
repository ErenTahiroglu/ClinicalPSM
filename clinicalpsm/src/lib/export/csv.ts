import type { DataRow, MatchedPair } from '@/lib/psm/types'

export function buildMatchedCsv(
  data: DataRow[],
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

  return rows.map(row => row.join(',')).join('\n')
}

export function downloadCsv(csvString: string, filename: string): void {
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
