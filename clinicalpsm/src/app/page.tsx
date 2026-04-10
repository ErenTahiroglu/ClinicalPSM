import { createClient } from '@/lib/supabase/server'
import { Upload, Settings2, Download } from 'lucide-react'
import Header from '@/components/shared/Header'
import { ButtonLink } from '@/components/ui/button-link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const features = [
  {
    icon: Upload,
    title: 'Upload Your Data',
    description:
      'Upload your dataset in CSV format. Preview the first rows and columns instantly — no data leaves your browser until you run the analysis.',
  },
  {
    icon: Settings2,
    title: 'Configure & Match',
    description:
      'Select your treatment variable, outcome, and covariates. Set matching ratio (1:1, 1:2, 1:3) and an optional caliper. ClinicalPSM handles the rest.',
  },
  {
    icon: Download,
    title: 'Download Results',
    description:
      'Get a standardized mean difference balance table, a Love plot, and a matched dataset CSV — ready for your paper or supplementary materials.',
  },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const ctaHref = user ? '/analyses' : '/register'
  const ctaLabel = user ? 'Go to Dashboard' : 'Start Free Analysis'

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="flex flex-1 flex-col">
        {/* Hero */}
        <section className="flex flex-col items-center justify-center gap-6 px-4 py-24 text-center">
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            Run Propensity Score Matching Without Code
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            ClinicalPSM is built for medical and academic researchers who need
            rigorous causal inference tools without R or Stata. Upload a CSV,
            configure your analysis, and download publication-ready results in
            minutes.
          </p>
          <ButtonLink href={ctaHref} size="lg">
            {ctaLabel}
          </ButtonLink>
          <p className="text-sm text-muted-foreground">
            1 analysis free — no credit card required ·{' '}
            <a href="/pricing" className="underline hover:text-foreground">
              See pricing
            </a>
          </p>
        </section>

        {/* Feature cards */}
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
