import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SettingsClient } from '@/components/settings/SettingsClient'
import type { Profile } from '@/types/database'

export const metadata = { title: 'Settings — ClinicalPSM' }

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, analyses_used, analyses_limit, plan_reset_at')
    .eq('user_id', user.id)
    .single<Pick<Profile, 'plan' | 'analyses_used' | 'analyses_limit' | 'plan_reset_at'>>()

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-8 text-2xl font-bold tracking-tight">Settings</h1>
      <SettingsClient email={user.email ?? ''} profile={profile} />
    </div>
  )
}
