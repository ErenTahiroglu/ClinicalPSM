import { vi, describe, it, expect, beforeEach } from 'vitest'

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => { throw new Error('user-session client must not be used for audit') }),
}))

import { AuditLogger, auditLog, buildAuditEntry, truncateIp, logPlanChanged } from '../audit'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

const UID = '11111111-1111-4111-8111-111111111111'
const AID = '22222222-2222-4222-8222-222222222222'
const SENTINELS = ['SYNTH_PATIENT_MRN_0042', 'synthetic_diagnosis.csv', 'SYNTH_CELL_99', 'SYNTH_COL_NAME']

function expectNoSentinel(v: unknown) {
  const s = JSON.stringify(v)
  for (const x of SENTINELS) expect(s).not.toContain(x)
}

beforeEach(() => {
  vi.clearAllMocks()
  insert.mockResolvedValue({ error: null })
})

describe('allowlist schema: adversarial sentinel content never reaches the persisted event', () => {
  it('drops unknown keys at any nesting level, whatever their name', () => {
    const e = buildAuditEntry({
      user_id: UID, action: 'FILE_UPLOADED', resource_type: 'upload', resource_id: AID,
      metadata: {
        analysisId: AID, fileSize: 10, rowCount: 3,
        notes: 'SYNTH_PATIENT_MRN_0042',
        x: { deep: [{ y: 'SYNTH_CELL_99' }] },
        fileName: 'synthetic_diagnosis.csv',
        Columns: ['SYNTH_COL_NAME'],
        zz_custom: 'SYNTH_CELL_99',
      },
    })
    expect(e?.metadata).toEqual({ analysisId: AID, fileSize: 10, rowCount: 3 })
    expectNoSentinel(e)
  })

  it('rejects sentinel strings placed in allowed keys with the wrong type/shape', () => {
    const e = buildAuditEntry({
      user_id: UID, action: 'FILE_UPLOADED', resource_type: 'upload', resource_id: 'SYNTH_PATIENT_MRN_0042',
      metadata: { analysisId: 'SYNTH_PATIENT_MRN_0042', fileSize: 'SYNTH_CELL_99', rowCount: -1 },
    })
    expect(e?.metadata).toEqual({})
    expect(e?.resource_id).toBeUndefined()
    expectNoSentinel(e)
  })

  it('error events keep only a bounded token name; messages, stacks, free-form context are dropped', () => {
    const e = buildAuditEntry({
      user_id: 'system', action: 'ERROR_OCCURRED', resource_type: 'system',
      metadata: { error_name: 'SyntaxError', error_message: 'SYNTH_CELL_99', stack: 'at SYNTH_COL_NAME', action: 'file_upload' },
    })
    expect(e?.metadata).toEqual({ error_name: 'SyntaxError', action: 'file_upload' })
    const bad = buildAuditEntry({
      user_id: 'system', action: 'ERROR_OCCURRED', resource_type: 'system',
      metadata: { error_name: 'bad name with spaces SYNTH_CELL_99' },
    })
    expect(bad?.metadata).toEqual({})
  })

  it('suspicious-activity free text is replaced by a fixed reason code', async () => {
    await auditLog.suspiciousActivity('Weird thing about SYNTH_PATIENT_MRN_0042', {
      url: 'https://x/?q=SYNTH_CELL_99', userAgent: 'SYNTH_COL_NAME', fileSize: 5,
    })
    const row = insert.mock.calls[0][0]
    expect(row.metadata).toEqual({ reason: 'unspecified', fileSize: 5 })
    expectNoSentinel(row)
  })

  it('known descriptions map to reason codes', async () => {
    await auditLog.suspiciousActivity('CSRF token validation failed', { method: 'POST', hasCsrfHeader: true, hasCsrfCookie: false })
    expect(insert.mock.calls[0][0].metadata).toEqual({
      reason: 'csrf_validation_failed', method: 'POST', hasCsrfHeader: true, hasCsrfCookie: false,
    })
  })

  it('unknown event types and non-UUID user ids are dropped entirely', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(buildAuditEntry({ user_id: UID, action: 'SYNTH_CELL_99', resource_type: 'x', metadata: { a: 1 } })).toBeNull()
    expect(buildAuditEntry({ user_id: 'SYNTH_PATIENT_MRN_0042', action: 'LOGIN', resource_type: 'user' })).toBeNull()
    await new (AuditLogger as unknown as new () => AuditLogger)().log({ user_id: UID, action: 'SYNTH_CELL_99', resource_type: 'x' })
    expect(insert).not.toHaveBeenCalled()
    expectNoSentinel(spy.mock.calls)
    spy.mockRestore()
  })

  it('resource_type is constrained per event', () => {
    const e = buildAuditEntry({ user_id: UID, action: 'LOGIN', resource_type: 'SYNTH_CELL_99' })
    expect(e?.resource_type).toBe('user')
  })

  it('never stores user-agent or the full IP', async () => {
    const req = new Request('http://x/', { headers: { 'user-agent': 'SYNTH_COL_NAME', 'x-forwarded-for': '203.0.113.77' } })
    await auditLog.userLogin(UID, req)
    const row = insert.mock.calls[0][0]
    expect(row).not.toHaveProperty('user_agent')
    expect(row.ip_address).toBe('203.0.113.0/24')
    expect(JSON.stringify(row)).not.toContain('203.0.113.77')
  })

  it('truncateIp handles v4, v6 and junk', () => {
    expect(truncateIp('198.51.100.9')).toBe('198.51.100.0/24')
    expect(truncateIp('2001:db8:abcd:12::1')).toBe('2001:db8:abcd::/48')
    expect(truncateIp('not an ip SYNTH_CELL_99')).toBeUndefined()
    expect(truncateIp(undefined)).toBeUndefined()
  })
})

describe('billing and trusted-client behavior preserved', () => {
  it('plan changes are logged with plan names and subscription token only', async () => {
    const client = { from } as unknown as SupabaseClient
    await logPlanChanged(client, UID, { toPlan: 'pro', subscriptionId: 'sub_123', fromPlan: 'SYNTH_CELL_99' })
    const row = insert.mock.calls[0][0]
    expect(row).toMatchObject({ user_id: UID, action: 'PLAN_CHANGED', resource_type: 'profile', resource_id: UID })
    expect(row.metadata).toEqual({ toPlan: 'pro', subscriptionId: 'sub_123' })
  })

  it('uses a fresh service-role client per call; never the user-session client', async () => {
    await auditLog.userLogin(UID)
    await auditLog.userLogout(UID)
    expect(createAdminClient).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenCalledWith('audit_logs')
  })

  it('logError records the error name only', async () => {
    await auditLog.errorOccurred(new SyntaxError('bad token SYNTH_CELL_99'), { analysisId: AID, action: 'file_upload' })
    const row = insert.mock.calls[0][0]
    expect(row.metadata).toEqual({ error_name: 'SyntaxError', analysisId: AID, action: 'file_upload' })
    expectNoSentinel(row)
  })

  it('does not print event content when the DB insert fails', async () => {
    insert.mockResolvedValue({ error: { code: 'XX000', message: 'SYNTH_CELL_99' } })
    const e = vi.spyOn(console, 'error').mockImplementation(() => {})
    const l = vi.spyOn(console, 'log').mockImplementation(() => {})
    await auditLog.fileUploaded(UID, AID, { fileName: 'synthetic_diagnosis.csv', fileSize: 1 })
    expectNoSentinel([...e.mock.calls, ...l.mock.calls])
    e.mockRestore(); l.mockRestore()
  })

  it('never throws if the admin client cannot be created', async () => {
    vi.mocked(createAdminClient).mockImplementationOnce(() => { throw new Error('no env') })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(auditLog.userLogin(UID)).resolves.toBeUndefined()
    expect(insert).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
