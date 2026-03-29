import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PsmWizard } from '@/components/analysis/PsmWizard'
import { ButtonLink } from '@/components/ui/button-link'
import type { Profile } from '@/types/database'

export default async function NewAnalysisPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('analyses_used, analyses_limit, plan')
    .eq('user_id', user.id)
    .single<Pick<Profile, 'analyses_used' | 'analyses_limit' | 'plan'>>()

  if (profile && profile.analyses_used >= profile.analyses_limit) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-xl font-bold">Analysis limit reached</h1>
        <p className="mt-2 text-muted-foreground">
          You have used all {profile.analyses_limit} free analyses on the{' '}
          <strong>{profile.plan}</strong> plan.
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
