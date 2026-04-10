import { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'

/**
 * Calculates the start of the current usage period in UTC.
 * - Free: Start of today (00:00:00 UTC)
 * - Plus: Start of current billing cycle (based on plan_reset_at)
 * - Pro/Other: 30 days ago fallback
 */
export function getUsagePeriodStart(plan: Profile['plan'], planResetAt?: string | null): Date {
  const now = new Date()
  
  if (plan === 'free') {
    // Start of current UTC day
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  }
  
  if (plan === 'plus' && planResetAt) {
    const resetDate = new Date(planResetAt)
    // If planResetAt is the NEXT reset date, the period started 1 month before.
    if (resetDate > now) {
      const start = new Date(resetDate)
      start.setMonth(start.getMonth() - 1)
      return start
    }
    return resetDate
  }
  
  // Default fallback: 30 days ago
  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  return thirtyDaysAgo
}

/**
 * Dynamically computes current analysis usage.
 */
export async function getCurrentUsage(
  supabase: SupabaseClient,
  userId: string,
  plan: Profile['plan'],
  limit: number,
  planResetAt?: string | null
) {
  // Pro is unlimited
  if (plan === 'pro' || limit >= 999999) {
    return { used: 0, limit: 999999, isAtLimit: false, periodStart: new Date(0) }
  }

  const periodStart = getUsagePeriodStart(plan, planResetAt)
  
  const { count, error } = await supabase
    .from('analyses')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', periodStart.toISOString())

  if (error) {
    console.error('[ClinicalPSM] Failed to fetch dynamic usage:', error)
    return { used: 0, limit, isAtLimit: false, periodStart }
  }

  const used = count || 0
  return {
    used,
    limit,
    isAtLimit: used >= limit,
    periodStart
  }
}
