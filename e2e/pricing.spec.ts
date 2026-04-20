import { test, expect } from '@playwright/test'

/**
 * Pricing page tests — run without authentication.
 * Covers locale-specific prices, subscribe CTAs, and redirect behaviour.
 */
test.describe('Pricing page', () => {
  // ── Subscribe CTA count ────────────────────────────────────────────────────
  test('EN: shows 2 Subscribe buttons for paid plans', async ({ page }) => {
    await page.goto('/en/pricing')
    const links = page.getByRole('link', { name: 'Subscribe' })
    await expect(links).toHaveCount(2)
  })

  test('TR: shows 2 Abone Ol buttons for paid plans', async ({ page }) => {
    await page.goto('/tr/pricing')
    const links = page.getByRole('link', { name: 'Abone Ol' })
    await expect(links).toHaveCount(2)
  })

  // ── Unauthenticated redirect ───────────────────────────────────────────────
  test('EN: unauthenticated Subscribe links go to /register, not Polar', async ({ page }) => {
    await page.goto('/en/pricing')
    const links = page.getByRole('link', { name: 'Subscribe' })
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href')
      expect(href).toContain('/register')
      expect(href).not.toContain('buy.polar.sh')
    }
  })

  test('TR: unauthenticated Abone Ol links go to /register, not Polar', async ({ page }) => {
    await page.goto('/tr/pricing')
    const links = page.getByRole('link', { name: 'Abone Ol' })
    const count = await links.count()
    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute('href')
      expect(href).toContain('/register')
      expect(href).not.toContain('buy.polar.sh')
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
