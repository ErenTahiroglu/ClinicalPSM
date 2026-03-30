import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui/button-link'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AnalysisResultDetail } from '@/components/analysis/AnalysisResultDetail'
import { DeleteAnalysisButton } from '@/components/analysis/DeleteAnalysisButton'
import type { Analysis, Profile } from '@/types/database'

const statusColors: Record<Analysis['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export default async function AnalysesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: profile }, { data: analyses }] = await Promise.all([
    supabase
      .from('profiles')
      .select('analyses_used, analyses_limit, plan')
      .eq('user_id', user.id)
      .single<Pick<Profile, 'analyses_used' | 'analyses_limit' | 'plan'>>(),
    supabase
      .from('analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .returns<Analysis[]>(),
  ])

  const atLimit =
    profile !== null &&
    profile.analyses_used >= profile.analyses_limit

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Upgrade banner */}
      {atLimit && (
        <div className="mb-6 flex items-center justify-between gap-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="text-sm text-yellow-800">
            You&apos;ve used all {profile!.analyses_limit} free analyses. Upgrade to continue.
          </p>
          <ButtonLink href="/pricing" size="sm" variant="outline">
            See Plans
          </ButtonLink>
        </div>
      )}

      {/* Header row */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Analyses</h1>
          {profile && (
            <p className="mt-1 text-sm text-muted-foreground">
              {profile.analyses_used} / {profile.analyses_limit} free analyses
              used
              {profile.plan !== 'free' && ` (${profile.plan} plan)`}
            </p>
          )}
        </div>

        <ButtonLink
          href="/new"
          size="sm"
          {...(atLimit ? { 'aria-disabled': true, tabIndex: -1 } : {})}
        >
          New Analysis
        </ButtonLink>
      </div>

      {/* Analyses list */}
      {!analyses || analyses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed px-8 py-16 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <svg
              className="h-6 w-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <p className="font-medium">No analyses yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload a CSV and run your first propensity score matching analysis.
          </p>
          <ButtonLink href="/new" size="sm" className="mt-5">
            Start your first analysis →
          </ButtonLink>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {analyses.map(analysis => (
            <Card key={analysis.id} className="overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/analyses/${analysis.id}`} className="hover:underline">
                    <CardTitle className="text-base">{analysis.name}</CardTitle>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[analysis.status]}`}
                    >
                      {analysis.status}
                    </span>
                    <DeleteAnalysisButton
                      analysisId={analysis.id}
                      analysisName={analysis.name}
                    />
                  </div>
                </div>
                <CardDescription>
                  {new Date(analysis.created_at).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                  {analysis.result_summary && (
                    <>
                      {' · '}
                      {analysis.result_summary.nMatched} matched pairs · overall
                      SMD after:{' '}
                      {analysis.result_summary.overallSmdAfter.toFixed(3)}
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              {analysis.config && (
                <CardContent className="pb-2">
                  <div className="flex flex-wrap gap-1">
                    {analysis.config.covariates.map(cov => (
                      <Badge key={cov} variant="secondary" className="text-xs">
                        {cov}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              )}
              <AnalysisResultDetail analysis={analysis} />
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
