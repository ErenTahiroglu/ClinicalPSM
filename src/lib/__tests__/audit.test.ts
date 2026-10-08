import { vi, describe, it, expect, beforeEach } from 'vitest'

const insert = vi.fn()
const from = vi.fn(() => ({ insert }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => ({ from })) }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => { throw new Error('user-session client must not be used for audit') }),
}))

import { AuditLogger, sanitizeAuditMetadata } from '../audit'
import { createAdminClient } from '@/lib/supabase/admin'

beforeEach(() => {
  vi.clearAllMocks()
  insert.mockResolvedValue({ error: null })
})

describe('sanitizeAuditMetadata', () => {
  it('strips filenames, column names, bodies, stacks and messages, recursively', () => {
    const out = sanitizeAuditMetadata({
      analysisId: 'a1',
      fileName: 'SYNTH_patient.csv',
      nested: { column_names: ['x'], keep: 1, error_stack: 'at foo' },
      list: [{ body: 'rows', ok: true }],
      message: 'Unexpected token in SYNTH_CELL',
    })
    expect(out).toEqual({ analysisId: 'a1', nested: { keep: 1 }, list: [{ ok: true }] })
  })
})

describe('AuditLogger', () => {
  it('writes with a fresh service-role client per call (no cached user session)', async () => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction('u1', 'LOGIN', 'user')
    await logger.logUserAction('u2', 'LOGIN', 'user')
    expect(createAdminClient).toHaveBeenCalledTimes(2)
    expect(from).toHaveBeenCalledWith('audit_logs')
  })

  it('logError records the error name only, never message or stack', async () => {
    const logger = await AuditLogger.getInstance()
    const err = new SyntaxError('bad token SYNTH_CELL_42')
    await logger.logError(err, { analysisId: 'a1' })
    const entry = insert.mock.calls[0][0]
    expect(JSON.stringify(entry)).not.toContain('SYNTH_CELL_42')
    expect(entry.metadata).toEqual({ error_name: 'SyntaxError', analysisId: 'a1' })
  })

  it('does not print metadata when the DB insert fails', async () => {
    insert.mockResolvedValue({ error: { code: 'XX000' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction('u1', 'FILE_UPLOADED', 'upload', 'x', { fileName: 'SYNTH.csv' })
    const printed = JSON.stringify([...spy.mock.calls, ...log.mock.calls])
    expect(printed).not.toContain('SYNTH.csv')
    spy.mockRestore(); log.mockRestore()
  })

  it('never throws if the admin client cannot be created', async () => {
    vi.mocked(createAdminClient).mockImplementationOnce(() => { throw new Error('no env') })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = await AuditLogger.getInstance()
    await expect(logger.logUserAction('u1', 'LOGIN', 'user')).resolves.toBeUndefined()
    spy.mockRestore()
  })
})
