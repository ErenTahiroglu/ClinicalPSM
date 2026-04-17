import { getLocale, getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import Header from '@/components/shared/Header'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ButtonLink } from '@/components/ui/button-link'
import type { Profile } from '@/types/database'

export default async function PricingPage() {
  const locale = await getLocale()
  const t = await getTranslations('pricing')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let currentPlan: Profile['plan'] | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('user_id', user.id)
      .single<Pick<Profile, 'plan'>>()
    currentPlan = profile?.plan ?? null
  }

  const planKeys = ['free', 'plus', 'pro'] as const

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <div className="mx-auto w-full max-w-5xl px-4 py-16">
        <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">
          {t('banner')}
        </div>

        <div className="mb-12 text-center">
          <h1 className="text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-3 text-muted-foreground">{t('subtitle')}</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {planKeys.map(key => {
            const isCurrent = currentPlan === key
            const features = t.raw(`plans.${key}.features`) as string[]

            return (
              <Card
                key={key}
                className={key === 'plus' ? 'ring-2 ring-primary' : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{t(`plans.${key}.name`)}</CardTitle>
                    {isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t('currentPlan')}
                      </span>
                    )}
                    {key === 'plus' && !isCurrent && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {t('mostPopular')}
                      </span>
                    )}
                  </div>
                  <CardDescription>{t(`plans.${key}.description`)}</CardDescription>
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-3xl font-bold">
                      {key === 'free' ? '$0' : key === 'plus' ? '$5' : '$20'}
                    </span>
                    {key !== 'free' && (
                      <span className="text-sm text-muted-foreground">/month</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{t(`plans.${key}.analyses`)}</p>
                </CardHeader>

                <CardContent>
                  <ul className="flex flex-col gap-2">
                    {features.map(feature => (
                      <li key={feature} className="flex items-center gap-2 text-sm">
                        <svg
                          className="h-4 w-4 shrink-0 text-green-500"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M3 8l3.5 3.5L13 5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>

                <CardFooter>
                  {key === 'free' ? (
                    isCurrent ? (
                      <ButtonLink
                        href={`/${locale}/analyses`}
                        variant="outline"
                        className="w-full justify-center"
                      >
                        {t('goToDashboard')}
                      </ButtonLink>
                    ) : (
                      <ButtonLink
                        href={`/${locale}/register`}
                        variant="outline"
                        className="w-full justify-center"
                      >
                        {t('getStarted')}
                      </ButtonLink>
                    )
                  ) : isCurrent ? (
                    <button
                      disabled
                      className="w-full cursor-not-allowed rounded-md border px-4 py-2 text-sm text-muted-foreground"
                    >
                      {t('currentPlan')}
                    </button>
                  ) : (
                    <button
                      disabled
                      className="w-full cursor-not-allowed rounded-md bg-primary/50 px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                      {t('comingSoon')}
                    </button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
