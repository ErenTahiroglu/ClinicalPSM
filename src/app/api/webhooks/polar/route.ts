import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import { withErrorHandling, ValidationError, ApiError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { planFromProductId, PLAN_CONFIG } from '@/lib/polar'
import { logPlanChanged } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Subscription } from '@polar-sh/sdk/models/components/subscription'

/** Thrown for failures Polar should retry (non-2xx => provider redelivers). */
class BillingRetryableError extends ApiError {
  constructor(code: string) {
    super(500, 'Billing update failed; retry later', code)
  }
}

/** Mapping failure Polar cannot fix by retrying quickly; non-2xx keeps it visible in the provider dashboard. */
class BillingMappingError extends ApiError {
  constructor() {
    super(422, 'Subscription could not be mapped to a user', 'UNRESOLVABLE_CUSTOMER')
  }
}

type Outcome = 'applied' | 'ignored'

/** Statuses that may grant a paid plan. 'incomplete', 'unpaid', 'canceled' etc. never grant. */
const GRANTING_STATUSES = new Set(['active', 'trialing', 'past_due'])

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_LOOKUP_PAGE_SIZE = 200
const EMAIL_LOOKUP_MAX_PAGES = 25

async function findUserIdByEmail(email: string, admin: SupabaseClient): Promise<string | null> {
  const wanted = email.trim().toLowerCase()
  for (let page = 1; page <= EMAIL_LOOKUP_MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: EMAIL_LOOKUP_PAGE_SIZE })
    if (error) throw new BillingRetryableError('USER_LOOKUP_FAILED')
    const users = data?.users ?? []
    const match = users.find(u => u.email?.trim().toLowerCase() === wanted)
    if (match) return match.id
    if (users.length < EMAIL_LOOKUP_PAGE_SIZE) return null
  }
  return null
}

async function resolveUserId(sub: Subscription, admin: SupabaseClient): Promise<string | null> {
  const ext = sub.customer?.externalId
  if (ext && UUID_RE.test(ext)) return ext
  const email = sub.customer?.email
  if (!email) return null
  return findUserIdByEmail(email, admin)
}

/**
 * Update one profile and VERIFY the result.
 * - DB error                     -> retryable 500
 * - 0 rows, auth user missing    -> 'ignored' (account deleted; nothing to entitle or revoke)
 * - 0 rows, auth user exists     -> retryable 500 (profile row missing/not yet created)
 */
async function updateProfileVerified(
  admin: SupabaseClient,
  userId: string,
  values: Record<string, unknown>
): Promise<Outcome> {
  const { data, error } = await admin
    .from('profiles')
    .update(values)
    .eq('user_id', userId)
    .select('user_id')
  if (error) throw new BillingRetryableError('PROFILE_UPDATE_FAILED')
  if (data && data.length > 0) return 'applied'

  const { data: u, error: uErr } = await admin.auth.admin.getUserById(userId)
  if (uErr && !/not.?found/i.test(uErr.message ?? '') && uErr.status !== 404) {
    throw new BillingRetryableError('USER_LOOKUP_FAILED')
  }
  if (!u?.user) return 'ignored'
  throw new BillingRetryableError('PROFILE_NOT_FOUND')
}

async function auditPlanChange(
  admin: SupabaseClient,
  userId: string,
  meta: { toPlan: string; subscriptionId?: string }
): Promise<void> {
  // The entitlement is already committed; an audit failure must not turn into a retry storm.
  try {
    await logPlanChanged(admin, userId, meta)
  } catch {
    console.error('[Polar webhook] audit write failed after entitlement change')
  }
}

async function applySubscriptionActive(sub: Subscription, admin: SupabaseClient): Promise<Outcome> {
  const plan = planFromProductId(sub.productId)
  if (!plan) {
    console.warn('[Polar webhook] Unknown productId; no entitlement change', sub.productId)
    return 'ignored'
  }
  if (!GRANTING_STATUSES.has(String(sub.status))) {
    console.warn('[Polar webhook] Non-granting subscription status; no entitlement change', sub.id)
    return 'ignored'
  }

  const userId = await resolveUserId(sub, admin)
  if (!userId) throw new BillingMappingError()

  const config = PLAN_CONFIG[plan]
  const outcome = await updateProfileVerified(admin, userId, {
    plan,
    analyses_limit: config.analysesLimit,
    plan_interval: config.interval,
    plan_reset_at: sub.currentPeriodEnd?.toISOString() ?? null,
    polar_customer_id: sub.customerId,
    polar_subscription_id: sub.id,
  })
  if (outcome === 'applied') await auditPlanChange(admin, userId, { toPlan: plan, subscriptionId: sub.id })
  return outcome
}

async function applySubscriptionRevoked(sub: Subscription, admin: SupabaseClient): Promise<Outcome> {
  const userId = await resolveUserId(sub, admin)
  if (!userId) throw new BillingMappingError()

  // Out-of-order protection: a revoke for an OLD subscription must not downgrade a user
  // who has since moved to a different subscription.
  const { data: current, error: readErr } = await admin
    .from('profiles')
    .select('polar_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (readErr) throw new BillingRetryableError('PROFILE_READ_FAILED')
  if (current?.polar_subscription_id && current.polar_subscription_id !== sub.id) {
    console.warn('[Polar webhook] Stale revoke for a different subscription; ignored', sub.id)
    return 'ignored'
  }

  const outcome = await updateProfileVerified(admin, userId, {
    plan: 'free',
    analyses_limit: PLAN_CONFIG.free.analysesLimit,
    plan_interval: PLAN_CONFIG.free.interval,
    plan_reset_at: null,
    polar_subscription_id: null,
  })
  if (outcome === 'applied') await auditPlanChange(admin, userId, { toPlan: 'free', subscriptionId: sub.id })
  return outcome
}

async function handler(req: Request): Promise<Response> {
  const rawBody = await req.text()
  const headers: Record<string, string> = {}
  req.headers.forEach((v, k) => { headers[k] = v })

  const secret = process.env.POLAR_WEBHOOK_SECRET
  if (!secret) {
    console.error('[Polar webhook] POLAR_WEBHOOK_SECRET not set')
    return Response.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  if (!process.env.POLAR_PLUS_PRODUCT_ID || !process.env.POLAR_PRO_PRODUCT_ID) {
    // Without product ids every purchase would be silently dropped as "unknown product".
    console.error('[Polar webhook] Polar product ids not configured')
    return Response.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  let event
  try {
    event = validateEvent(rawBody, headers, secret)
  } catch (err) {
    if (err instanceof WebhookVerificationError) throw new ValidationError('Invalid signature')
    throw err
  }

  const admin = createAdminClient()

  let outcome: Outcome | 'unhandled' = 'unhandled'
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.active':
    case 'subscription.uncanceled':
      outcome = await applySubscriptionActive(event.data, admin)
      break
    case 'subscription.revoked':
      outcome = await applySubscriptionRevoked(event.data, admin)
      break
    case 'subscription.canceled':
      console.log('[Polar webhook] subscription.canceled: no action (access continues until revoked)')
      break
    default:
      console.log('[Polar webhook] Unhandled event type:', event.type)
  }

  return Response.json({ ok: true, outcome })
}

// Intentionally no withCSRF — webhook signature is the auth mechanism
export const POST = withErrorHandling(handler)
