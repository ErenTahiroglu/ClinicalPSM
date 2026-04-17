import { notFound, redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { LovePlot } from '@/features/analysis/components/LovePlot'
import { Badge } from '@/components/ui/badge'
import { PrintButton } from '@/features/analysis/components/PrintButton'
import type { Analysis } from '@/types/database'

export default async function PrintPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>
}) {
  const { id } = await params
  const locale = await getLocale()
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect(`/${locale}/login`)

  const { data: analysis } = await supabase
    .from('analyses')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single<Analysis>()

  if (!analysis) notFound()

  const r = analysis.result_summary

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { font-size: 11pt; }
          h1 { font-size: 16pt; }
          h2 { font-size: 13pt; }
          table { page-break-inside: avoid; }
          svg { page-break-inside: avoid; }
        }
      `}</style>

      <div className="mx-auto max-w-4xl px-6 py-8">
        <div className="no-print mb-6 flex gap-3">
          <a
            href={`/${locale}/analyses/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back
          </a>
          <PrintButton />
        </div>

        <div className="mb-8 border-b pb-6">
          <h1 className="text-2xl font-bold tracking-tight">{analysis.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ClinicalPSM — Propensity Score Matching Report ·{' '}
            {new Date(analysis.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {analysis.config && (
          <section className="mb-8">
            <h2 className="mb-3 font-semibold">Configuration</h2>
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
          </section>
        )}

        {!r ? (
          <p className="text-muted-foreground">No results available.</p>
        ) : (
          <>
            <section className="mb-8">
              <h2 className="mb-3 font-semibold">Summary Statistics</h2>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { label: 'Treated units', value: r.nTreated },
                  { label: 'Control units', value: r.nControl },
                  { label: 'Matched pairs', value: r.nMatched },
                  { label: 'Mean |SMD| before matching', value: r.overallSmdBefore.toFixed(3) },
                  { label: 'Mean |SMD| after matching', value: r.overallSmdAfter.toFixed(3) },
                  { label: 'Logistic regression convergence', value: r.converged ? 'Yes' : 'No (100 iterations)' },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded border p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="mt-0.5 text-lg font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-8">
              <h2 className="mb-3 font-semibold">Balance Table</h2>
              <div className="overflow-x-auto rounded border">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      {['Covariate', 'Mean Treated', 'Mean Control', 'SMD Before', 'SMD After', 'VR Before', 'VR After'].map(h => (
                        <th key={h} className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground">
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
              <p className="mt-1 text-xs text-muted-foreground">|SMD| &lt; 0.1 indicates good balance. VR = Variance Ratio.</p>
            </section>

            <section className="mb-8">
              <h2 className="mb-3 font-semibold">Love Plot</h2>
              <LovePlot balanceTable={r.balanceTable} />
            </section>

            <section className="mt-8 border-t pt-6 text-xs text-muted-foreground">
              <p>
                <strong>Methodology:</strong> Propensity scores were estimated using logistic regression with gradient descent (100 iterations, learning rate 0.01). Nearest neighbor 1:{analysis.config?.ratio ?? 1} matching without replacement was used
                {analysis.config?.caliper != null ? ` with a caliper of ${analysis.config.caliper.toFixed(4)}.` : ' (no caliper).'}{' '}
                Analysis performed with ClinicalPSM (clinicalpsm.com).
              </p>
            </section>
          </>
        )}
      </div>
    </>
  )
}
