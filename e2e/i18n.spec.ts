import { test, expect } from '@playwright/test'

/**
 * i18n / locale switching tests.
 * Verifies that the LangSwitcher preserves the current path and that each
 * locale renders its own translated copy.
 *
 * Note: the auth layout (login/register) does not include the Header, so the
 * LangSwitcher is only available on pages that render the full Header
 * (landing, pricing, dashboard). Tests here use pricing which is public.
 */
test.describe('i18n locale switching', () => {
  // ── Path preservation ──────────────────────────────────────────────────────
  test('EN pricing → click switcher → lands on /tr/pricing', async ({ page }) => {
    await page.goto('/en/pricing')
    await page.click('[aria-label="Switch language"]')
    await expect(page).toHaveURL('/tr/pricing')
  })

  test('TR pricing → click switcher → lands on /en/pricing', async ({ page }) => {
    await page.goto('/tr/pricing')
    await page.click('[aria-label="Switch language"]')
    await expect(page).toHaveURL('/en/pricing')
  })

  test('EN landing → click switcher → lands on /tr', async ({ page }) => {
    await page.goto('/en')
    await page.click('[aria-label="Switch language"]')
    await expect(page).toHaveURL('/tr')
  })

  test('TR landing → click switcher → lands on /en', async ({ page }) => {
    await page.goto('/tr')
    await page.click('[aria-label="Switch language"]')
    await expect(page).toHaveURL('/en')
  })

  // ── Switcher button text reflects the OTHER locale ─────────────────────────
  test('EN page: switcher button shows "TR"', async ({ page }) => {
    await page.goto('/en/pricing')
    const btn = page.getByRole('button', { name: 'Switch language' })
    await expect(btn).toBeVisible()
    await expect(btn).toHaveText('TR')
  })

  test('TR page: switcher button shows "EN"', async ({ page }) => {
    await page.goto('/tr/pricing')
    const btn = page.getByRole('button', { name: 'Switch language' })
    await expect(btn).toBeVisible()
    await expect(btn).toHaveText('EN')
  })

  // ── Correct language per locale ────────────────────────────────────────────
  test('EN pricing shows English plan names (Plus, Pro)', async ({ page }) => {
    await page.goto('/en/pricing')
    // Plan names are in CardTitle (div), not a semantic heading
    await expect(page.getByText('Plus').first()).toBeVisible()
    await expect(page.getByText('Pro').first()).toBeVisible()
  })

  test('TR pricing shows Turkish free plan label (Ücretsiz)', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByText('Ücretsiz').first()).toBeVisible()
  })

  test('EN pricing page title is in English', async ({ page }) => {
    await page.goto('/en/pricing')
    await expect(page.getByText('Simple, transparent pricing')).toBeVisible()
  })

  test('TR pricing page title is in Turkish', async ({ page }) => {
    await page.goto('/tr/pricing')
    await expect(page.getByText('Sade ve şeffaf fiyatlandırma')).toBeVisible()
  })

  test('EN register shows English submit button', async ({ page }) => {
    await page.goto('/en/register')
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible()
  })

  test('TR register shows Turkish submit button', async ({ page }) => {
    await page.goto('/tr/register')
    await expect(page.getByRole('button', { name: 'Hesap Oluştur' })).toBeVisible()
  })

  // ── Root redirect ──────────────────────────────────────────────────────────
  test('/ redirects to a locale-prefixed URL', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/(en|tr)/)
  })
})
