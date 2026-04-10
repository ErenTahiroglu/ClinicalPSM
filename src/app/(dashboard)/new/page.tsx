import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PsmWizard } from '@/features/analysis/components/PsmWizard'
import { ButtonLink } from '@/components/ui/button-link'
import type { Profile } from '@/types/database'
import { getCurrentUsage } from '@/lib/usage'

export default async function NewAnalysisPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_limit, plan, plan_reset_at')
    .eq('user_id', user.id)
    .single<Pick<Profile, 'analyses_limit' | 'plan' | 'plan_reset_at'>>()

  const usage = profile 
    ? await getCurrentUsage(supabase, user.id, profile.plan, profile.analyses_limit, profile.plan_reset_at)
    : { used: 0, limit: 1, isAtLimit: false }

  if (profile && usage.isAtLimit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Limit reached</h1>
        <p className="mt-2 text-muted-foreground">
          {profile.plan === 'free'
            ? `You've used your daily free analysis. Try again tomorrow or upgrade.`
            : `You've used all ${usage.limit} analyses for this period on the ${profile.plan} plan.`}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/analyses" variant="outline" size="sm">
            Back to Dashboard
          </ButtonLink>
          <ButtonLink href="/pricing" size="sm">
            See Plans
          </ButtonLink>
        </div>
      </div>
    )
  }

  return <PsmWizard />
}
