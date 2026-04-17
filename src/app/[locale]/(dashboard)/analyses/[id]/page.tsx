import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { LovePlot } from '@/features/analysis/components/LovePlot'
import { AnalysisDetailExport } from '@/features/analysis/components/AnalysisDetailExport'
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
  params: Promise<{ id: string; locale: string }>
}) {
  const { id } = await params
  const locale = await getLocale()
  const t = await getTranslations('analysisDetail')
  const tStatus = await getTranslations('analyses.status')
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
    <div className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href={`/${locale}/analyses`} className="hover:text-foreground">
          {t('breadcrumb')}
        </Link>
        <span className="mx-1.5">›</span>
        <span className="text-foreground">{analysis.name}</span>
      </nav>

      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{analysis.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {new Date(analysis.created_at).toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColors[analysis.status]}`}
        >
          {tStatus(analysis.status)}
        </span>
      </div>

      {analysis.config && (
        <div className="mb-8 rounded-lg border p-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t('config.title')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">{t('config.treatment')}</p>
              <p className="font-medium">{analysis.config.treatmentColumn}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('config.ratio')}</p>
              <p className="font-medium">1:{analysis.config.ratio}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('config.caliper')}</p>
              <p className="font-medium">
                {analysis.config.caliper != null
                  ? analysis.config.caliper.toFixed(4)
                  : t('config.none')}
              </p>
            </div>
          </div>
          {analysis.config.covariates.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-xs text-muted-foreground">{t('config.covariates')}</p>
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
          <p>{t('noResults')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-10">
          <section>
            <h2 className="mb-3 font-semibold">{t('summary.title')}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: t('summary.treated'), value: r.nTreated },
                { label: t('summary.control'), value: r.nControl },
                { label: t('summary.matched'), value: r.nMatched },
                { label: t('summary.smdBefore'), value: r.overallSmdBefore.toFixed(3) },
                { label: t('summary.smdAfter'), value: r.overallSmdAfter.toFixed(3) },
                {
                  label: t('summary.convergence'),
                  value: r.converged ? t('summary.converged') : t('summary.notConverged'),
                },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-0.5 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">{t('balanceTable.title')}</h2>
            <div className="overflow-x-auto rounded-lg border">
              <table className="min-w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    {[
                      t('balanceTable.covariate'),
                      t('balanceTable.meanTreated'),
                      t('balanceTable.meanControl'),
                      t('balanceTable.smdBefore'),
                      t('balanceTable.smdAfter'),
                      t('balanceTable.vrBefore'),
                      t('balanceTable.vrAfter'),
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
            <p className="mt-1 text-xs text-muted-foreground">{t('balanceTable.hint')}</p>
          </section>

          <section>
            <h2 className="mb-3 font-semibold">{t('lovePlot.title')}</h2>
            <LovePlot balanceTable={r.balanceTable} />
          </section>

          <AnalysisDetailExport analysis={analysis} />
        </div>
      )}
    </div>
  )
}
