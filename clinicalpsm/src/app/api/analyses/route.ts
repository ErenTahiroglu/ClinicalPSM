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

  // Server-side quota check
  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_used, analyses_limit')
    .eq('user_id', user.id)
    .single()

  if (profile && profile.analyses_used >= profile.analyses_limit) {
    throw new ForbiddenError('Analysis limit reached. Upgrade to continue.')
  }

  const body = await req.json()
  const name = (body.name as string | undefined)?.trim() || 'Untitled Analysis'

  const { data, error } = await supabase
    .from('analyses')
    .insert({ user_id: user.id, name, status: 'draft' })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // Log analysis creation
  await auditLog.analysisCreated(
    user.id,
    data.id,
    { name, status: 'draft' },
    req as NextRequest
  )

  return NextResponse.json({ analysis: data }, { status: 201 })
}

export const POST = withCSRF(withErrorHandling(handleCreateAnalysis))

