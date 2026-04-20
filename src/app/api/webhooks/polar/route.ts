import { validateEvent, WebhookVerificationError } from '@polar-sh/sdk/webhooks'
import { withErrorHandling, ValidationError } from '@/lib/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { planFromProductId, PLAN_CONFIG } from '@/lib/polar'
import { logPlanChanged } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Subscription } from '@polar-sh/sdk/models/components/subscription'

async function resolveUserId(
  sub: Subscription,
  admin: SupabaseClient
): Promise<string | null> {
  if (sub.customer?.externalId) return sub.customer.externalId

  const email = sub.customer?.email
  if (!email) return null

  const { data } = await admin.auth.admin.listUsers()
  const match = data?.users?.find(u => u.email === email)
  return match?.id ?? null
}

async function applySubscriptionActive(
  sub: Subscription,
  admin: SupabaseClient
): Promise<void> {
  const userId = await resolveUserId(sub, admin)
  if (!userId) {
    console.warn('[Polar webhook] Could not resolve userId for subscription', sub.id)
    return
  }

  const plan = planFromProductId(sub.productId)
  if (!plan) {
    console.warn('[Polar webhook] Unknown productId', sub.productId)
    return
  }

  const config = PLAN_CONFIG[plan]
  await admin.from('profiles').update({
    plan,
    analyses_limit: config.analysesLimit,
    plan_interval: config.interval,
    plan_reset_at: sub.currentPeriodEnd?.toISOString() ?? null,
    polar_customer_id: sub.customerId,
    polar_subscription_id: sub.id,
  }).eq('user_id', userId)

  await logPlanChanged(admin, userId, { toPlan: plan, subscriptionId: sub.id })
}

async function applySubscriptionRevoked(
  sub: Subscription,
  admin: SupabaseClient
): Promise<void> {
  const userId = await resolveUserId(sub, admin)
  if (!userId) {
    console.warn('[Polar webhook] Could not resolve userId for revoked subscription', sub.id)
    return
  }

  await admin.from('profiles').update({
    plan: 'free',
    analyses_limit: PLAN_CONFIG.free.analysesLimit,
    plan_interval: PLAN_CONFIG.free.interval,
    plan_reset_at: null,
    polar_subscription_id: null,
  }).eq('user_id', userId)

  await logPlanChanged(admin, userId, { toPlan: 'free', subscriptionId: sub.id })
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

  let event
  try {
    event = validateEvent(rawBody, headers, secret)
  } catch (err) {
    if (err instanceof WebhookVerificationError) throw new ValidationError('Invalid signature')
    throw err
  }

  const admin = createAdminClient()

  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.active':
    case 'subscription.uncanceled':
      await applySubscriptionActive(event.data, admin)
      break
    case 'subscription.revoked':
      await applySubscriptionRevoked(event.data, admin)
      break
    case 'subscription.canceled':
      console.log('[Polar webhook] subscription.canceled — no action (access continues until revoked)')
      break
    default:
      console.log('[Polar webhook] Unhandled event type:', event.type)
  }

  return Response.json({ ok: true })
}

// Intentionally no withCSRF — webhook signature is the auth mechanism
export const POST = withErrorHandling(handler)
