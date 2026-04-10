import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from '@/features/profile/components/SettingsClient'
import type { Profile } from '@/types/database'
import { getCurrentUsage } from '@/lib/usage'

export const metadata = { title: 'Settings — ClinicalPSM' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, analyses_limit, plan_reset_at')
    .eq('user_id', user.id)
    .single<Pick<Profile, 'plan' | 'analyses_limit' | 'plan_reset_at'>>()

  const usage = profile
    ? await getCurrentUsage(supabase, user.id, profile.plan, profile.analyses_limit, profile.plan_reset_at)
    : { used: 0, limit: 1 }

  // Construct a profile-like object for the client component
  const clientProfile = profile ? {
    plan: profile.plan,
    analyses_limit: usage.limit,
    analyses_used: usage.used,
    plan_reset_at: profile.plan_reset_at
  } : null

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsClient email={user.email ?? ''} profile={clientProfile} />
    </div>
  )
}
