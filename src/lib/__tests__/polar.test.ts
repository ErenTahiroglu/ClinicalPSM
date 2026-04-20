import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  buildPolarCheckoutUrl,
  planFromProductId,
  PLAN_CONFIG,
  POLAR_CHECKOUT_URLS,
} from '../polar'

describe('PLAN_CONFIG', () => {
  it('has correct shape for all three plans', () => {
    expect(PLAN_CONFIG.free).toEqual({ analysesLimit: 1, interval: 'daily' })
    expect(PLAN_CONFIG.plus).toEqual({ analysesLimit: 20, interval: 'monthly' })
    expect(PLAN_CONFIG.pro).toEqual({ analysesLimit: 999999, interval: 'monthly' })
  })
})

describe('buildPolarCheckoutUrl', () => {
  it('returns base URL when no opts', () => {
    expect(buildPolarCheckoutUrl('plus')).toBe(POLAR_CHECKOUT_URLS.plus)
    expect(buildPolarCheckoutUrl('pro')).toBe(POLAR_CHECKOUT_URLS.pro)
  })

  it('appends customer_email when provided', () => {
    const url = new URL(buildPolarCheckoutUrl('plus', { email: 'test@mit.edu' }))
    expect(url.searchParams.get('customer_email')).toBe('test@mit.edu')
  })

  it('appends customer_external_id when userId provided', () => {
    const url = new URL(buildPolarCheckoutUrl('pro', { userId: 'user-123' }))
    expect(url.searchParams.get('customer_external_id')).toBe('user-123')
  })

  it('encodes special chars in params', () => {
    const url = new URL(buildPolarCheckoutUrl('plus', { email: 'user+tag@example.edu' }))
    expect(url.searchParams.get('customer_email')).toBe('user+tag@example.edu')
  })
})

describe('planFromProductId', () => {
  const origPlus = process.env.POLAR_PLUS_PRODUCT_ID
  const origPro = process.env.POLAR_PRO_PRODUCT_ID

  beforeEach(() => {
    process.env.POLAR_PLUS_PRODUCT_ID = 'prod_plus_test'
    process.env.POLAR_PRO_PRODUCT_ID = 'prod_pro_test'
  })

  afterEach(() => {
    process.env.POLAR_PLUS_PRODUCT_ID = origPlus
    process.env.POLAR_PRO_PRODUCT_ID = origPro
  })

  it('returns plus for the plus product ID', () => {
    expect(planFromProductId('prod_plus_test')).toBe('plus')
  })

  it('returns pro for the pro product ID', () => {
    expect(planFromProductId('prod_pro_test')).toBe('pro')
  })

  it('returns null for unknown product ID', () => {
    expect(planFromProductId('prod_unknown')).toBeNull()
  })
})
