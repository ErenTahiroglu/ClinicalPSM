import { describe, it, expect } from 'vitest'
import { buildBalanceTableCsv } from '../balance-table'
import type { BalanceRow } from '@/lib/psm/types'

function makeRow(overrides: Partial<BalanceRow> = {}): BalanceRow {
  return {
    covariate: 'age',
    meanTreated: 50.0,
    meanControl: 40.0,
    sdPooled: 10.0,
    smdBefore: 1.0,
    smdAfter: 0.1,
    varianceRatioBefore: 1.2,
    varianceRatioAfter: 0.9,
    ...overrides,
  }
}

describe('buildBalanceTableCsv', () => {
  it('first line is the correct 8-column header', () => {
    const csv = buildBalanceTableCsv([makeRow()])
    const header = csv.split('\n')[0]
    expect(header).toBe(
      'Covariate,Mean (Treated),Mean (Control),SD Pooled,SMD Before,SMD After,Variance Ratio Before,Variance Ratio After'
    )
  })

  it('produces one data row per BalanceRow', () => {
    const csv = buildBalanceTableCsv([makeRow({ covariate: 'age' }), makeRow({ covariate: 'bmi' })])
    const lines = csv.split('\n')
    // header + 2 data rows
    expect(lines).toHaveLength(3)
  })

  it('empty balance table returns only the header', () => {
    const csv = buildBalanceTableCsv([])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(1)
  })

  it('covariate name appears in first column of data row', () => {
    const csv = buildBalanceTableCsv([makeRow({ covariate: 'blood_pressure' })])
    const dataLine = csv.split('\n')[1]
    expect(dataLine.startsWith('blood_pressure,')).toBe(true)
  })

  it('numeric values are formatted to exactly 4 decimal places', () => {
    const csv = buildBalanceTableCsv([
      makeRow({ meanTreated: 50.123456789, smdBefore: 1.0 }),
    ])
    const dataLine = csv.split('\n')[1]
    expect(dataLine).toContain('50.1235') // rounded to 4dp
    expect(dataLine).toContain('1.0000')
  })

  it('each data row has exactly 8 fields', () => {
    const csv = buildBalanceTableCsv([makeRow()])
    const dataLine = csv.split('\n')[1]
    // Split by comma, accounting for possible quoted cells
    const fields = dataLine.split(',')
    expect(fields).toHaveLength(8)
  })

  it('covariate names containing a comma are quoted (RFC 4180)', () => {
    const csv = buildBalanceTableCsv([makeRow({ covariate: 'age, bmi' })])
    expect(csv).toContain('"age, bmi"')
  })

  it('covariate names containing a double-quote escape the quote', () => {
    const csv = buildBalanceTableCsv([makeRow({ covariate: 'var "X"' })])
    expect(csv).toContain('"var ""X"""')
  })
})
