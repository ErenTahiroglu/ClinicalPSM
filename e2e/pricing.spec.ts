import { test, expect } from '@playwright/test'

/**
 * Pricing page tests — run without authentication.
 * Covers locale-specific prices, subscribe CTAs, and redirect behaviour.
 */
test.describe('Pricing page', () => {
  // ── CP-00 purchase hold ────────────────────────────────────────────────────
  test('EN: no Subscribe links; paid plans show paused state', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByRole('link', { name: 'Subscribe' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Temporarily unavailable' })).toHaveCount(2)
    await expect(page.getByRole('status')).toContainText('temporarily paused')
  })

  test('TR: no Abone Ol links; paid plans show paused state', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByRole('link', { name: 'Abone Ol' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Geçici olarak kullanılamıyor' })).toHaveCount(2)
    await expect(page.getByRole('status')).toContainText('geçici olarak durduruldu')
  })

  test('page HTML never contains a hosted checkout URL', async ({ page }) => {
    for (const l of ['en', 'tr']) {
      await page.goto(`/${l}/pricing`)
      expect(await page.content()).not.toContain('buy.polar.sh')
    }
  })

  // ── Locale-specific prices ─────────────────────────────────────────────────
  test('EN: displays USD prices for Plus and Pro', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByText('$10/mo')).toBeVisible()
    await expect(page.getByText('$25/mo')).toBeVisible()
  })

  test('TR: displays TRY prices for Plus and Pro', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByText('₺250/ay')).toBeVisible()
    await expect(page.getByText('₺1250/ay')).toBeVisible()
  })

  // ── Pay-what-you-want notes ────────────────────────────────────────────────
  test('EN: shows pay-what-you-want minimum note for Plus', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByText(/min \$5/)).toBeVisible()
  })

  test('EN: shows pay-what-you-want minimum note for Pro', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByText(/min \$20/)).toBeVisible()
  })

  test('TR: shows pay-what-you-want minimum note for Plus', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByText(/min ₺200/)).toBeVisible()
  })

  test('TR: shows pay-what-you-want minimum note for Pro', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByText(/min ₺1000/)).toBeVisible()
  })

  // ── Free plan has no Subscribe CTA ────────────────────────────────────────
  test('EN: free plan shows Get started button, not Subscribe', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByRole('link', { name: 'Get started free' })).toBeVisible()
  })

  test('TR: free plan shows Ücretsiz başla button, not Abone Ol', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByRole('link', { name: 'Ücretsiz başla' })).toBeVisible()
  })
})
