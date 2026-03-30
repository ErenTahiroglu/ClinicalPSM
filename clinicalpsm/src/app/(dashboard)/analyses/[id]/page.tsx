import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LovePlot } from '@/components/analysis/LovePlot'
import { AnalysisDetailExport } from '@/components/analysis/AnalysisDetailExport'
import { Badge } from '@/components/ui/badge'
import type { Analysis } from '@/types/database'

const statusColors: Record<Analysis['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export default async function AnalysisDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: analysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single<Analysis>()

  if (!analysis) notFound()

  const r = analysis.result_summary

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/analyses" className="hover:text-foreground">
          Your Analyses
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">{analysis.name}</span>
      </nav>

      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{analysis.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(analysis.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[analysis.status]}`}
        >
          {analysis.status}
        </span>
      </div>

      {/* Config summary */}
      {analysis.config && (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Configuration
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Treatment variable</p>
              <p className="font-medium">{analysis.config.treatmentColumn}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Matching ratio</p>
              <p className="font-medium">1:{analysis.config.ratio}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Caliper</p>
              <p className="font-medium">
                {analysis.config.caliper != null
                  ? analysis.config.caliper.toFixed(4)
                  : 'None'}
              </p>
            </div>
          </div>
          {analysis.config.covariates.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted-foreground">Covariates</p>
              <div className="flex flex-wrap gap-1">
                {analysis.config.covariates.map(cov => (
                  <Badge key={cov} variant="secondary" className="text-xs">
                    {cov}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {analysis.status !== 'completed' || !r ? (
        <div className="rounded-lg border border-dashed px-8 py-12 text-center text-muted-foreground">
          <p>No results available for this analysis.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          {/* Summary stats */}
          <section>
            <h2 className="mb-3 font-semibold">Summary</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Treated units', value: r.nTreated },
                { label: 'Control units', value: r.nControl },
                { label: 'Matched pairs', value: r.nMatched },
                { label: 'Mean |SMD| before', value: r.overallSmdBefore.toFixed(3) },
                { label: 'Mean |SMD| after', value: r.overallSmdAfter.toFixed(3) },
                { label: 'Convergence', value: r.converged ? 'Yes' : 'No (100 iter)' },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Balance table */}
          <section>
            <h2 className="mb-3 font-semibold">Balance Table</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      'Covariate',
                      'Mean (Treated)',
                      'Mean (Control)',
                      'SMD Before',
                      'SMD After',
                      'VR Before',
                      'VR After',
                    ].map(h => (
                      <th
                        key={h}
                        className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {r.balanceTable.map(row => (
                    <tr key={row.covariate} className="border-t">
                      <td className="px-3 py-1.5 font-medium">{row.covariate}</td>
                      <td className="px-3 py-1.5">{row.meanTreated.toFixed(3)}</td>
                      <td className="px-3 py-1.5">{row.meanControl.toFixed(3)}</td>
                      <td className={`px-3 py-1.5 ${Math.abs(row.smdBefore) > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                        {row.smdBefore.toFixed(3)}
                      </td>
                      <td className={`px-3 py-1.5 font-medium ${Math.abs(row.smdAfter) > 0.1 ? 'text-red-600' : 'text-green-600'}`}>
                        {row.smdAfter.toFixed(3)}
                      </td>
                      <td className="px-3 py-1.5">{row.varianceRatioBefore.toFixed(3)}</td>
                      <td className="px-3 py-1.5">{row.varianceRatioAfter.toFixed(3)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              |SMD| &lt; 0.1 indicates good balance (shown in green).
            </p>
          </section>

          {/* Love plot */}
          <section>
            <h2 className="mb-3 font-semibold">Love Plot</h2>
            <LovePlot balanceTable={r.balanceTable} />
          </section>

          {/* Export */}
          <AnalysisDetailExport analysis={analysis} />
        </div>
      )}
    </div>
  )
}
