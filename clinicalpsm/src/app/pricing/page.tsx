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

const plans = [
  {
    key: 'free' as const,
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Get started with no commitment',
    analyses: '1 analysis total',
    features: [
      '1 lifetime analysis',
      'CSV upload (5 MB max)',
      'Balance table + Love plot',
      'CSV export',
    ],
  },
  {
    key: 'plus' as const,
    name: 'Plus',
    price: '$5',
    period: '/month',
    description: 'For active researchers',
    analyses: '20 analyses / month',
    features: [
      '20 analyses per month',
      'CSV upload (5 MB max)',
      'Balance table + Love plot',
      'CSV export',
      'Email support',
    ],
  },
  {
    key: 'pro' as const,
    name: 'Pro',
    price: '$20',
    period: '/month',
    description: 'For high-volume research',
    analyses: 'Unlimited analyses',
    features: [
      'Unlimited analyses',
      'CSV upload (5 MB max)',
      'Balance table + Love plot',
      'CSV export',
      'Priority support',
    ],
  },
]

export default async function PricingPage() {
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

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
    <div className="mx-auto w-full max-w-5xl px-4 py-16">
      <div className="mb-8 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-800">
        Paid plans launching soon. The Free plan is fully available — start running analyses today.
      </div>

      <div className="mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Simple, transparent pricing</h1>
        <p className="mt-3 text-muted-foreground">
          Start for free. Upgrade when you need more.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {plans.map(plan => {
          const isCurrent = currentPlan === plan.key

          return (
            <Card
              key={plan.key}
              className={plan.key === 'plus' ? 'ring-2 ring-primary' : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{plan.name}</CardTitle>
                  {isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Current plan
                    </span>
                  )}
                  {plan.key === 'plus' && !isCurrent && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                      Most popular
                    </span>
                  )}
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{plan.price}</span>
                  {plan.period && (
                    <span className="text-sm text-muted-foreground">{plan.period}</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{plan.analyses}</p>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col gap-2">
                  {plan.features.map(feature => (
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
                {plan.key === 'free' ? (
                  isCurrent ? (
                    <ButtonLink
                      href="/analyses"
                      variant="outline"
                      className="w-full justify-center"
                    >
                      Go to dashboard
                    </ButtonLink>
                  ) : (
                    <ButtonLink
                      href="/register"
                      variant="outline"
                      className="w-full justify-center"
                    >
                      Get started free
                    </ButtonLink>
                  )
                ) : isCurrent ? (
                  <button
                    disabled
                    className="w-full cursor-not-allowed rounded-md border px-4 py-2 text-sm text-muted-foreground"
                  >
                    Current plan
                  </button>
                ) : (
                  <button
                    disabled
                    className="w-full cursor-not-allowed rounded-md bg-primary/50 px-4 py-2 text-sm font-medium text-primary-foreground"
                  >
                    Coming Soon
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
