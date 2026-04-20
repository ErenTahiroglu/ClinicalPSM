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
const USER_ID         = 'user-uuid-test-abc'
const SUBSCRIPTION_ID = 'sub_test_123'
const CUSTOMER_ID     = 'cust_polar_abc'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal POST request. validateEvent is mocked so the body/headers don't matter. */
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

/** Build a fake Polar subscription event payload. */
function makeFakeEvent(type: string, dataOverrides: Record<string, unknown> = {}) {
  return {
    type,
    timestamp: new Date(),
    data: {
      id: SUBSCRIPTION_ID,
      customerId: CUSTOMER_ID,
      productId: PLUS_PRODUCT_ID,
      currentPeriodEnd: new Date('2026-07-01T00:00:00.000Z'),
      customer: {
        externalId: USER_ID,
        email: 'researcher@mit.edu',
        emailVerified: true,
      },
      ...dataOverrides,
    },
  }
}

/** Build a Supabase admin client mock with fluent .from().update().eq() chain. */
function makeAdminMock(opts?: { listUsers?: Array<{ id: string; email: string }> }) {
  const eq       = vi.fn().mockResolvedValue({ error: null })
  const update   = vi.fn().mockReturnValue({ eq })
  const from     = vi.fn().mockReturnValue({ update })
  const listUsers = vi.fn().mockResolvedValue({
    data: { users: opts?.listUsers ?? [] },
    error: null,
  })

  const admin = {
    from,
    auth: { admin: { listUsers } },
  } as unknown as SupabaseClient

  return { admin, from, update, eq, listUsers }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/webhooks/polar', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>
  let logSpy:  ReturnType<typeof vi.spyOn>
  let errSpy:  ReturnType<typeof vi.spyOn>

  const savedEnv: Record<string, string | undefined> = {}

  beforeEach(() => {
    vi.resetAllMocks()

    // Re-apply implementations reset by resetAllMocks
    vi.mocked(logPlanChanged).mockResolvedValue(undefined)

    // Set a default admin client mock; individual tests override as needed
    const { admin } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)

    // validateEvent must be configured per-test; default throws clearly
    vi.mocked(validateEvent).mockImplementation(() => {
      throw new Error('validateEvent mock not configured for this test')
    })

    // Suppress console noise; tests that need to assert on warnings re-enable them
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logSpy  = vi.spyOn(console, 'log').mockImplementation(() => {})
    errSpy  = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Save and set env vars
    for (const k of ['POLAR_WEBHOOK_SECRET', 'POLAR_PLUS_PRODUCT_ID', 'POLAR_PRO_PRODUCT_ID']) {
      savedEnv[k] = process.env[k]
    }
    process.env.POLAR_WEBHOOK_SECRET  = 'test-secret'
    process.env.POLAR_PLUS_PRODUCT_ID = PLUS_PRODUCT_ID
    process.env.POLAR_PRO_PRODUCT_ID  = PRO_PRODUCT_ID
  })

  afterEach(() => {
    for (const k of ['POLAR_WEBHOOK_SECRET', 'POLAR_PLUS_PRODUCT_ID', 'POLAR_PRO_PRODUCT_ID']) {
      if (savedEnv[k] !== undefined) process.env[k] = savedEnv[k]
      else delete process.env[k]
    }
    warnSpy.mockRestore()
    logSpy.mockRestore()
    errSpy.mockRestore()
  })

  // ── Test 1 ────────────────────────────────────────────────────────────────
  it('returns 500 when POLAR_WEBHOOK_SECRET is not set', async () => {
    delete process.env.POLAR_WEBHOOK_SECRET
    const res = await POST(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Webhook not configured')
    expect(vi.mocked(validateEvent)).not.toHaveBeenCalled()
  })

  // ── Test 2 ────────────────────────────────────────────────────────────────
  it('returns 422 for invalid webhook signature', async () => {
    vi.mocked(validateEvent).mockImplementationOnce(() => {
      throw new WebhookVerificationError('signature mismatch')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  // ── Test 3 ────────────────────────────────────────────────────────────────
  it('does not update profile for unknown productId', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.created', { productId: 'unknown_product_xyz' }) as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).not.toHaveBeenCalled()
  })

  // ── Test 4 ────────────────────────────────────────────────────────────────
  it('upgrades to plus on subscription.created with plus productId', async () => {
    const { admin, update, eq } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.created') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    const updateArgs = update.mock.calls[0][0]
    expect(updateArgs.plan).toBe('plus')
    expect(updateArgs.analyses_limit).toBe(20)
    expect(updateArgs.plan_interval).toBe('monthly')
    expect(updateArgs.polar_subscription_id).toBe(SUBSCRIPTION_ID)
    expect(updateArgs.polar_customer_id).toBe(CUSTOMER_ID)
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(vi.mocked(logPlanChanged)).toHaveBeenCalledWith(
      admin,
      USER_ID,
      expect.objectContaining({ toPlan: 'plus' })
    )
  })

  // ── Test 5 ────────────────────────────────────────────────────────────────
  it('upgrades to pro on subscription.active with pro productId', async () => {
    const { admin, update, eq } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.active', { productId: PRO_PRODUCT_ID }) as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    const updateArgs = update.mock.calls[0][0]
    expect(updateArgs.plan).toBe('pro')
    expect(updateArgs.analyses_limit).toBe(999999)
    expect(updateArgs.plan_interval).toBe('monthly')
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID)
  })

  // ── Test 6 ────────────────────────────────────────────────────────────────
  it('downgrades to free on subscription.revoked', async () => {
    const { admin, update, eq } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.revoked') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    const updateArgs = update.mock.calls[0][0]
    expect(updateArgs.plan).toBe('free')
    expect(updateArgs.analyses_limit).toBe(1)
    expect(updateArgs.plan_interval).toBe('daily')
    expect(updateArgs.plan_reset_at).toBeNull()
    expect(updateArgs.polar_subscription_id).toBeNull()
    expect(eq).toHaveBeenCalledWith('user_id', USER_ID)
    expect(vi.mocked(logPlanChanged)).toHaveBeenCalledWith(
      admin,
      USER_ID,
      expect.objectContaining({ toPlan: 'free' })
    )
  })

  // ── Test 7 ────────────────────────────────────────────────────────────────
  it('does not update profile on subscription.canceled (access continues until revoked)', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.canceled') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).not.toHaveBeenCalled()
    expect(vi.mocked(logPlanChanged)).not.toHaveBeenCalled()
  })

  // ── Test 8 ────────────────────────────────────────────────────────────────
  it('resolves userId via email fallback when externalId is missing', async () => {
    const fallbackUserId = 'email-fallback-user-id'
    const { admin, update, eq } = makeAdminMock({
      listUsers: [{ id: fallbackUserId, email: 'researcher@mit.edu' }],
    })
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.created', {
        customer: { externalId: null, email: 'researcher@mit.edu', emailVerified: true },
      }) as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    expect(eq).toHaveBeenCalledWith('user_id', fallbackUserId)
  })

  // ── Test 9 ────────────────────────────────────────────────────────────────
  it('returns 200 without throwing when both externalId and email are missing', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.created', {
        customer: { externalId: null, email: null, emailVerified: false },
      }) as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).not.toHaveBeenCalled()
  })

  // ── Test 10 ───────────────────────────────────────────────────────────────
  it('handles duplicate event delivery idempotently — both calls return 200', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    const event = makeFakeEvent('subscription.created')
    vi.mocked(validateEvent)
      .mockReturnValueOnce(event as never)
      .mockReturnValueOnce(event as never)

    const [res1, res2] = await Promise.all([POST(makeRequest()), POST(makeRequest())])
    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    // Both deliveries write the same values — safe repeated upsert
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls[0][0]).toEqual(update.mock.calls[1][0])
  })

  // ── Bonus: account deleted before revoke webhook arrives ──────────────────
  it('returns 200 when profile update affects 0 rows (account already deleted)', async () => {
    // Supabase .update().eq() returns { error: null } even with 0 matched rows
    const { admin } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.revoked') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })

  // ── Bonus: subscription.updated and subscription.uncanceled also upgrade ──
  it('upgrades on subscription.updated', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.updated') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].plan).toBe('plus')
  })

  it('upgrades on subscription.uncanceled', async () => {
    const { admin, update } = makeAdminMock()
    vi.mocked(createAdminClient).mockReturnValue(admin)
    vi.mocked(validateEvent).mockReturnValueOnce(
      makeFakeEvent('subscription.uncanceled') as never
    )
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][0].plan).toBe('plus')
  })
})
