/**
 * Unit tests for POST /api/webhooks/polar
 *
 * All external dependencies are mocked so these tests run without a real
 * Supabase instance, Polar credentials, or network access.
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Module mocks — hoisted before all imports by Vitest's transformer
// ---------------------------------------------------------------------------

vi.mock('@polar-sh/sdk/webhooks', () => {
  // Mirror the real class so instanceof checks in the route still work
  class WebhookVerificationError extends Error {
    constructor(msg: string) {
      super(msg)
      this.name = 'WebhookVerificationError'
    }
  }
  return { validateEvent: vi.fn(), WebhookVerificationError }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/audit', () => ({
  logPlanChanged: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports (receive the mocked versions)
// ---------------------------------------------------------------------------

import { POST } from '../route'
import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import { createAdminClient } from '@/lib/supabase/admin'
import { logPlanChanged } from '@/lib/audit'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLUS_PRODUCT_ID = 'test_prod_plus_123'
const PRO_PRODUCT_ID  = 'test_prod_pro_456'
const USER_ID         = '11111111-1111-4111-8111-111111111111'
const SUBSCRIPTION_ID = 'sub_test_123'
const CUSTOMER_ID     = 'cust_polar_abc'

function makeRequest() {
  return new Request('http://localhost/api/webhooks/polar', {
    method: 'POST',
    body: '{}',
    headers: {
      'content-type': 'application/json',
      'webhook-id': 'test-event-id',
      'webhook-timestamp': '1745000000',
      'webhook-signature': 'v1,fakesig',
    },
  })
}

function makeFakeEvent(type: string, dataOverrides: Record<string, unknown> = {}) {
  return {
    type,
    timestamp: new Date(),
    data: {
      id: SUBSCRIPTION_ID,
      status: 'active',
      customerId: CUSTOMER_ID,
      productId: PLUS_PRODUCT_ID,
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      customer: { externalId: USER_ID, email: 'researcher@example.test', emailVerified: true },
      ...dataOverrides,
    },
  }
}

interface AdminOpts {
  updateResult?: { data: Array<{ user_id: string }> | null; error: { code?: string } | null }
  currentSubId?: string | null
  readError?: boolean
  getUser?: { data: { user: { id: string } | null }; error: { message: string; status?: number } | null }
  listPages?: Array<{ users: Array<{ id: string; email: string }>; error?: { message: string } | null }>
}

/** Fluent mock: from('profiles').update(v).eq().select()  and  .select('..').eq().maybeSingle() */
function makeAdminMock(opts: AdminOpts = {}) {
  const updateResult = opts.updateResult ?? { data: [{ user_id: USER_ID }], error: null }
  const select  = vi.fn().mockResolvedValue(updateResult)
  const eqU     = vi.fn().mockReturnValue({ select })
  const update  = vi.fn().mockReturnValue({ eq: eqU })
  const maybeSingle = vi.fn().mockResolvedValue(
    opts.readError
      ? { data: null, error: { code: 'XX000' } }
      : { data: opts.currentSubId === undefined ? null : { polar_subscription_id: opts.currentSubId }, error: null }
  )
  const eqR     = vi.fn().mockReturnValue({ maybeSingle })
  const selectR = vi.fn().mockReturnValue({ eq: eqR })
  const from    = vi.fn().mockReturnValue({ update, select: selectR })
  const pages = opts.listPages ?? [{ users: [] }]
  const listUsers = vi.fn()
  pages.forEach(p => listUsers.mockResolvedValueOnce({ data: { users: p.users }, error: p.error ?? null }))
  listUsers.mockResolvedValue({ data: { users: [] }, error: null })
  const getUserById = vi.fn().mockResolvedValue(opts.getUser ?? { data: { user: { id: USER_ID } }, error: null })
  const admin = { from, auth: { admin: { listUsers, getUserById } } } as unknown as SupabaseClient
  return { admin, from, update, eq: eqU, select, listUsers, getUserById }
}

function use(admin: SupabaseClient, event?: unknown) {
  vi.mocked(createAdminClient).mockReturnValue(admin)
  if (event) vi.mocked(validateEvent).mockReturnValueOnce(event as never)
}

describe('POST /api/webhooks/polar', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy:  ReturnType<typeof vi.spyOn>
  let errSpy:  ReturnType<typeof vi.spyOn>
  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(logPlanChanged).mockResolvedValue(undefined)
    vi.mocked(createAdminClient).mockReturnValue(makeAdminMock().admin)
    vi.mocked(validateEvent).mockImplementation(() => { throw new Error('validateEvent mock not configured for this test') })
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {})
    errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const k of ['POLAR_WEBHOOK_SECRET', 'POLAR_PLUS_PRODUCT_ID', 'POLAR_PRO_PRODUCT_ID']) savedEnv[k] = process.env[k]
    process.env.POLAR_WEBHOOK_SECRET  = 'test-secret'
    process.env.POLAR_PLUS_PRODUCT_ID = PLUS_PRODUCT_ID
    process.env.POLAR_PRO_PRODUCT_ID  = PRO_PRODUCT_ID
  })

  afterEach(() => {
    for (const k of ['POLAR_WEBHOOK_SECRET', 'POLAR_PLUS_PRODUCT_ID', 'POLAR_PRO_PRODUCT_ID']) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]
      else delete process.env[k]
    }
    warnSpy.mockRestore(); logSpy.mockRestore(); errSpy.mockRestore()
  })

  // ── configuration and signature ───────────────────────────────────────────
  it('returns 500 when POLAR_WEBHOOK_SECRET is not set', async () => {
    delete process.env.POLAR_WEBHOOK_SECRET
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Webhook not configured')
    expect(vi.mocked(validateEvent)).not.toHaveBeenCalled()
  })

  it('returns 500 (retryable) when product ids are not configured, instead of dropping purchases', async () => {
    delete process.env.POLAR_PLUS_PRODUCT_ID
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 422 for invalid webhook signature and touches nothing', async () => {
    const { admin, update, from } = makeAdminMock()
    use(admin)
    vi.mocked(validateEvent).mockImplementationOnce(() => { throw new WebhookVerificationError('signature mismatch') })
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('VALIDATION_ERROR')
    expect(update).not.toHaveBeenCalled()
    expect(from).not.toHaveBeenCalled()
  })

  // ── happy paths (semantics preserved) ─────────────────────────────────────
  it('upgrades to plus on subscription.created', async () => {
    const { admin, update, eq } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('applied')
    const a = update.mock.calls[0][0]
    expect(a).toMatchObject({ plan: 'plus', analyses_limit: 20, plan_interval: 'monthly', polar_subscription_id: SUBSCRIPTION_ID, polar_customer_id: CUSTOMER_ID })
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(vi.mocked(logPlanChanged)).toHaveBeenCalledWith(admin, USER_ID, expect.objectContaining({ toPlan: 'plus' }))
  })

  it('upgrades to pro on subscription.active', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.active', { productId: PRO_PRODUCT_ID }))
    expect((await POST(makeRequest())).status).toBe(200)
    expect(update.mock.calls[0][0]).toMatchObject({ plan: 'pro', analyses_limit: 999999 })
  })

  for (const type of ['subscription.updated', 'subscription.uncanceled']) {
    it(`upgrades on ${type}`, async () => {
      const { admin, update } = makeAdminMock()
      use(admin, makeFakeEvent(type))
      expect((await POST(makeRequest())).status).toBe(200)
      expect(update.mock.calls[0][0].plan).toBe('plus')
    })
  }

  it('downgrades to free on subscription.revoked for the current subscription', async () => {
    const { admin, update, eq } = makeAdminMock({ currentSubId: SUBSCRIPTION_ID })
    use(admin, makeFakeEvent('subscription.revoked'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update.mock.calls[0][0]).toMatchObject({ plan: 'free', analyses_limit: 1, plan_interval: 'daily', plan_reset_at: null, polar_subscription_id: null })
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(vi.mocked(logPlanChanged)).toHaveBeenCalledWith(admin, USER_ID, expect.objectContaining({ toPlan: 'free' }))
  })

  it('does not change anything on subscription.canceled', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.canceled'))
    expect((await POST(makeRequest())).status).toBe(200)
    expect(update).not.toHaveBeenCalled()
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  // ── NEGATIVE: unknown product / non-granting status never upgrades ────────
  it('does not update for an unknown productId (acknowledged, no entitlement)', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created', { productId: 'unknown_product_xyz' }))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('ignored')
    expect(update).not.toHaveBeenCalled()
  })

  for (const status of ['incomplete', 'incomplete_expired', 'unpaid', 'canceled', undefined, 'brand_new_status']) {
    it(`never grants a plan for subscription status ${String(status)}`, async () => {
      const { admin, update } = makeAdminMock()
      use(admin, makeFakeEvent('subscription.created', { status }))
      const res = await POST(makeRequest())
      expect(res.status).toBe(200)
      expect(update).not.toHaveBeenCalled()
    })
  }

  // ── NEGATIVE: database failures are never acknowledged ────────────────────
  it('returns 500 when the profile update returns a database error (retryable)', async () => {
    const { admin } = makeAdminMock({ updateResult: { data: null, error: { code: '57P03' } } })
    use(admin, makeFakeEvent('subscription.created'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('PROFILE_UPDATE_FAILED')
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  it('revoke also returns 500 on database error (a failed downgrade is not acknowledged)', async () => {
    const { admin } = makeAdminMock({ currentSubId: SUBSCRIPTION_ID, updateResult: { data: null, error: { code: '40001' } } })
    use(admin, makeFakeEvent('subscription.revoked'))
    expect((await POST(makeRequest())).status).toBe(500)
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  it('returns 500 when the read preceding a revoke fails', async () => {
    const { admin, update } = makeAdminMock({ readError: true })
    use(admin, makeFakeEvent('subscription.revoked'))
    expect((await POST(makeRequest())).status).toBe(500)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 500 when zero rows are updated but the auth user still exists (profile missing)', async () => {
    const { admin } = makeAdminMock({ updateResult: { data: [], error: null } })
    use(admin, makeFakeEvent('subscription.created'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('PROFILE_NOT_FOUND')
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  it('returns 500 when zero rows and the user lookup itself fails', async () => {
    const { admin } = makeAdminMock({ updateResult: { data: [], error: null }, getUser: { data: { user: null }, error: { message: 'timeout', status: 500 } } })
    use(admin, makeFakeEvent('subscription.created'))
    expect((await POST(makeRequest())).status).toBe(500)
  })

  it('acknowledges zero rows only when the auth user is gone (deleted account), without auditing or granting', async () => {
    const { admin } = makeAdminMock({
      updateResult: { data: [], error: null },
      getUser: { data: { user: null }, error: { message: 'User not found', status: 404 } },
    })
    use(admin, makeFakeEvent('subscription.created'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('ignored')
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  it('a thrown/unknown Supabase failure surfaces as 500, not 200', async () => {
    const { admin, select } = makeAdminMock()
    select.mockRejectedValueOnce(new Error('network down'))
    use(admin, makeFakeEvent('subscription.created'))
    expect((await POST(makeRequest())).status).toBe(500)
  })

  // ── NEGATIVE: customer mapping ────────────────────────────────────────────
  it('returns 422 when neither externalId nor email can be mapped (never silently skipped)', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created', { customer: { externalId: null, email: null, emailVerified: false } }))
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    expect((await res.json()).code).toBe('UNRESOLVABLE_CUSTOMER')
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 422 for a non-UUID externalId with no email (no DB error loop)', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created', { customer: { externalId: "1; drop table profiles", email: null } }))
    expect((await POST(makeRequest())).status).toBe(422)
    expect(update).not.toHaveBeenCalled()
  })

  it('returns 422 when email matches no user', async () => {
    const { admin, update } = makeAdminMock({ listPages: [{ users: [{ id: 'x', email: 'other@example.test' }] }] })
    use(admin, makeFakeEvent('subscription.created', { customer: { externalId: null, email: 'researcher@example.test' } }))
    expect((await POST(makeRequest())).status).toBe(422)
    expect(update).not.toHaveBeenCalled()
  })

  it('resolves via email fallback (case-insensitive) and follows pagination', async () => {
    const fallbackId = '22222222-2222-4222-8222-222222222222'
    const full = Array.from({ length: 200 }, (_, i) => ({ id: `u${i}`, email: `u${i}@example.test` }))
    const { admin, update, eq, listUsers } = makeAdminMock({
      listPages: [{ users: full }, { users: [{ id: fallbackId, email: 'Researcher@Example.Test' }] }],
    })
    use(admin, makeFakeEvent('subscription.created', { customer: { externalId: null, email: 'researcher@example.test' } }))
    expect((await POST(makeRequest())).status).toBe(200)
    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledOnce()
    expect(eq).toHaveBeenCalledWith('user_id', fallbackId)
  })

  it('returns 500 when the email lookup call errors (retryable), not a silent skip', async () => {
    const { admin, update } = makeAdminMock({ listPages: [{ users: [], error: { message: 'boom' } }] })
    use(admin, makeFakeEvent('subscription.created', { customer: { externalId: null, email: 'researcher@example.test' } }))
    expect((await POST(makeRequest())).status).toBe(500)
    expect(update).not.toHaveBeenCalled()
  })

  // ── audit failure after a committed entitlement ───────────────────────────
  it('still returns 200 when the audit insert fails after the entitlement was committed', async () => {
    const { admin, update } = makeAdminMock()
    use(admin, makeFakeEvent('subscription.created'))
    vi.mocked(logPlanChanged).mockRejectedValueOnce(new Error('audit down'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
  })

  // ── replay and ordering ───────────────────────────────────────────────────
  it('duplicate delivery is idempotent: identical values written, both 200', async () => {
    const { admin, update } = makeAdminMock()
    use(admin)
    const event = makeFakeEvent('subscription.created')
    vi.mocked(validateEvent).mockReturnValueOnce(event as never).mockReturnValueOnce(event as never)
    const [a, b] = await Promise.all([POST(makeRequest()), POST(makeRequest())])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0][0]).toEqual(update.mock.calls[1][0])
  })

  it('stale revoke of an OLD subscription does not downgrade a user on a newer subscription', async () => {
    const { admin, update } = makeAdminMock({ currentSubId: 'sub_newer_999' })
    use(admin, makeFakeEvent('subscription.revoked'))
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect((await res.json()).outcome).toBe('ignored')
    expect(update).not.toHaveBeenCalled()
  })

  it('revoke proceeds when the profile has no recorded subscription id', async () => {
    const { admin, update } = makeAdminMock({ currentSubId: null })
    use(admin, makeFakeEvent('subscription.revoked'))
    expect((await POST(makeRequest())).status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
  })

  it('error responses never echo emails, ids from the payload or database messages', async () => {
    const { admin } = makeAdminMock({ updateResult: { data: null, error: { code: 'XX000' } } })
    use(admin, makeFakeEvent('subscription.created'))
    const text = await (await POST(makeRequest())).text()
    expect(text).not.toContain('example.test')
    expect(text).not.toContain(USER_ID)
    expect(text).not.toContain(SUBSCRIPTION_ID)
  })
})
