/**
 * CP-00 safety hold: API routes must reject before reading payloads, sessions,
 * storage, database, or audit log. All data below is synthetic.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/audit', () => ({
  auditLog: {
    fileUploaded: vi.fn(),
    suspiciousActivity: vi.fn(),
    rateLimitExceeded: vi.fn(),
    errorOccurred: vi.fn(),
    analysisCreated: vi.fn(),
  },
}))

import { createClient } from '@/lib/supabase/server'
import { auditLog } from '@/lib/audit'
import * as uploadRoute from '../analyses/[id]/upload/route'
import * as resultsRoute from '../analyses/[id]/results/route'
import * as createRoute from '../analyses/route'
import * as deleteRoute from '../analyses/[id]/route'
import { CLINICAL_WRITES_SUSPENDED_CODE } from '@/lib/safety'

const SENTINELS = ['synthetic_col_alpha', 'SYNTH-FILE-NAME', 'synthetic_cell_999', '0.123456789']
const ctx = { params: Promise.resolve({ id: 'analysis-1' }) }

function expectNoLeak(text: string) {
  for (const s of SENTINELS) expect(text).not.toContain(s)
}

let logSpies: ReturnType<typeof vi.spyOn>[]
beforeEach(() => {
  vi.clearAllMocks()
  logSpies = (['log', 'warn', 'error', 'info'] as const).map(m =>
    vi.spyOn(console, m).mockImplementation(() => {})
  )
})
afterEach(() => logSpies.forEach(s => s.mockRestore()))

function loggedText(): string {
  return JSON.stringify(logSpies.flatMap(s => s.mock.calls))
}

describe('upload route', () => {
  it('rejects with 503 before reading the multipart body, session, storage or audit log', async () => {
    const fd = new FormData()
    fd.append('file', new File(['synthetic_col_alpha,t\nsynthetic_cell_999,1\n'], 'SYNTH-FILE-NAME.csv', { type: 'text/csv' }))
    fd.append('columnNames', JSON.stringify(['synthetic_col_alpha']))
    const req = new NextRequest('http://localhost/api/analyses/analysis-1/upload', { method: 'POST', body: fd })
    const formDataSpy = vi.spyOn(req, 'formData')
    const textSpy = vi.spyOn(req, 'text')
    const jsonSpy = vi.spyOn(req, 'json')

    const res = await uploadRoute.POST(req, ctx)
    const text = await res.text()

    expect(res.status).toBe(503)
    expect(JSON.parse(text).code).toBe(CLINICAL_WRITES_SUSPENDED_CODE)
    expectNoLeak(text)
    expectNoLeak(loggedText())
    expect(formDataSpy).not.toHaveBeenCalled()
    expect(textSpy).not.toHaveBeenCalled()
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
    for (const fn of Object.values(auditLog)) expect(fn).not.toHaveBeenCalled()
  })

  it('rejects even an oversized request (size-limit path must not log filenames)', async () => {
    const req = new NextRequest('http://localhost/api/analyses/analysis-1/upload', {
      method: 'POST',
      headers: { 'content-length': String(50 * 1024 * 1024), 'content-type': 'multipart/form-data; boundary=x' },
      body: '--x--',
    })
    const res = await uploadRoute.POST(req, ctx)
    expect(res.status).toBe(503)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('results route', () => {
  it('rejects with 503 before parsing JSON or touching the database', async () => {
    const body = JSON.stringify({
      resultSummary: { propensityScores: [0.123456789], matchedPairs: [{ treatedIndex: 1, controlIndex: 2 }] },
      config: { covariates: ['synthetic_col_alpha'] },
    })
    const req = new NextRequest('http://localhost/api/analyses/analysis-1/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    const jsonSpy = vi.spyOn(req, 'json')
    const res = await resultsRoute.POST(req, ctx)
    const text = await res.text()

    expect(res.status).toBe(503)
    expectNoLeak(text)
    expectNoLeak(loggedText())
    expect(jsonSpy).not.toHaveBeenCalled()
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('create-analysis route', () => {
  it('rejects with 503 before CSRF, session or quota logic', async () => {
    const req = new Request('http://localhost/api/analyses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'synthetic_col_alpha' }),
    })
    const res = await createRoute.POST(req)
    expect(res.status).toBe(503)
    expectNoLeak(await res.text())
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('no bypass via other HTTP methods or routes', () => {
  const methods = ['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'POST']
  const exported = (m: Record<string, unknown>) => methods.filter(x => x in m)

  it('write routes export POST only', () => {
    expect(exported(uploadRoute)).toEqual(['POST'])
    expect(exported(resultsRoute)).toEqual(['POST'])
    expect(exported(createRoute)).toEqual(['POST'])
  })

  it('deletion path is preserved (legacy data remains user-deletable)', () => {
    expect(exported(deleteRoute)).toEqual(['DELETE'])
  })
})
