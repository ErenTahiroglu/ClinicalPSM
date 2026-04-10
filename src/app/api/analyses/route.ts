import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { withCSRF } from '@/lib/csrf'
import {
  withErrorHandling,
  RateLimitError,
  UnauthorizedError,
  ForbiddenError,
} from '@/lib/errors'
import { auditLog } from '@/lib/audit'
import { getUsagePeriodStart } from '@/lib/usage'
import type { Analysis } from '@/types/database'

async function handleCreateAnalysis(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  if (!checkRateLimit(rateLimitKey(ip, 'create-analysis'), 10)) {
    await auditLog.rateLimitExceeded('analysis', undefined, { ip }, req as NextRequest)
    throw new RateLimitError()
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (!user || authError) throw new UnauthorizedError()

  // Get current plan and limit config
  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_limit, plan, plan_reset_at')
    .eq('user_id', user.id)
    .single()

  if (!profile) throw new ForbiddenError('Profile not found')

  const body = await req.json()
  const name = (body.name as string | undefined)?.trim() || 'Untitled Analysis'
  const periodStart = getUsagePeriodStart(profile.plan, profile.plan_reset_at)

  // Use the RPC to perform atomic check + insert with advisory lock
  const { data: analyses, error: rpcError } = await supabase.rpc('create_analysis_with_limit_check', {
    p_user_id: user.id,
    p_name: name,
    p_status: 'draft',
    p_period_start: periodStart.toISOString(),
    p_limit: profile.analyses_limit,
  })

  if (rpcError) {
    if (rpcError.message.includes('Daily limit reached') || rpcError.code === 'P0001') {
      const msg = profile.plan === 'free' 
        ? 'Daily analysis limit reached. Try again tomorrow or upgrade.'
        : 'Monthly analysis limit reached. Upgrade to continue.'
      throw new ForbiddenError(msg)
    }
    throw new Error(rpcError.message)
  }

  const analysis = (analyses as Analysis[] | null)?.[0]
  if (!analysis) throw new Error('Failed to create analysis')

  // Log analysis creation
  await auditLog.analysisCreated(
    user.id,
    analysis.id,
    { name, status: 'draft' },
    req as NextRequest
  )

  return NextResponse.json({ analysis }, { status: 201 })
}

export const POST = withCSRF(withErrorHandling(handleCreateAnalysis))

