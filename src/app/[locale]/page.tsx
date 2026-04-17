import { getTranslations } from 'next-intl/server'
import { Upload, Settings2, Download } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/shared/Header'
import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'landing' })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ctaHref = user ? '/analyses' : '/register'
  const ctaLabel = user ? t('hero.ctaDashboard') : t('hero.ctaStart')

  const features = [
    {
      icon: Upload,
      title: t('features.upload.title'),
      description: t('features.upload.description'),
    },
    {
      icon: Settings2,
      title: t('features.configure.title'),
      description: t('features.configure.description'),
    },
    {
      icon: Download,
      title: t('features.download.title'),
      description: t('features.download.description'),
    },
  ]

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex flex-1 flex-col">
        <section className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            {t('hero.title')}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            {t('hero.description')}
          </p>
          <ButtonLink href={ctaHref} size="lg">
            {ctaLabel}
          </ButtonLink>
          <p className="text-sm text-muted-foreground">
            {t('hero.subtext')}
            <a href="/pricing" className="underline hover:text-foreground">
              {t('hero.seePricing')}
            </a>
          </p>
        </section>

        <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-24 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card key={title}>
              <CardHeader>
                <Icon className="mb-1 h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{description}</p>
              </CardContent>
            </Card>
          ))}
        </section>
      </main>

      <footer className="border-t py-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} ClinicalPSM
      </footer>
    </div>
  )
}
