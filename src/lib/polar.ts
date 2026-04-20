export const POLAR_CHECKOUT_URLS = {
  plus: 'https://buy.polar.sh/polar_cl_qGDywjE4LOrepoPMR2qBG5puP60Oj4GZjNlmB4MpDKH',
  pro: 'https://buy.polar.sh/polar_cl_Ie0w7Rzml8NPBi9m3B9ITrGFWUsK2Kb5fknJd3Ihe2r',
} as const

export type PaidPlan = keyof typeof POLAR_CHECKOUT_URLS

export const PLAN_CONFIG = {
  free: { analysesLimit: 1,      interval: 'daily'   },
  plus: { analysesLimit: 20,     interval: 'monthly' },
  pro:  { analysesLimit: 999999, interval: 'monthly' },
} as const

export function buildPolarCheckoutUrl(
  plan: PaidPlan,
  opts?: { email?: string; userId?: string }
): string {
  const url = new URL(POLAR_CHECKOUT_URLS[plan])
  if (opts?.email) url.searchParams.set('customer_email', opts.email)
  if (opts?.userId) url.searchParams.set('customer_external_id', opts.userId)
  return url.toString()
}

export function planFromProductId(productId: string): PaidPlan | null {
  if (productId === process.env.POLAR_PLUS_PRODUCT_ID) return 'plus'
  if (productId === process.env.POLAR_PRO_PRODUCT_ID)  return 'pro'
  return null
}
