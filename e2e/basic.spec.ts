import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

test.describe('Basic Functionality', () => {
  test('should load landing page', async ({ page }) => {
    await page.goto(BASE_URL)
    
    // Check main elements are present
    await expect(page.locator('h1')).toBeVisible()
    await expect(page.locator('text=ClinicalPSM')).toBeVisible()
  })

  test('should navigate to login page', async ({ page }) => {
    await page.goto(BASE_URL)
    
    // Click login button
    await page.click('text=Login')
    
    // Should redirect to login page
    await expect(page).toHaveURL(`${BASE_URL}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('should navigate to register page', async ({ page }) => {
    await page.goto(BASE_URL)
    
    // Click register button
    await page.click('text=Register')
    
    // Should redirect to register page
    await expect(page).toHaveURL(`${BASE_URL}/register`)
    await expect(page.locator('input[name="email"]')).toBeVisible()
    await expect(page.locator('input[name="password"]')).toBeVisible()
    await expect(page.locator('input[name="confirmPassword"]')).toBeVisible()
  })

  test('should show pricing page', async ({ page }) => {
    await page.goto(`${BASE_URL}/pricing`)

    // Check pricing plans are displayed
    await expect(page.locator('text=Free')).toBeVisible()
    await expect(page.locator('text=Plus')).toBeVisible()
    await expect(page.locator('text=Pro')).toBeVisible()
  })

  test('pricing page shows subscribe CTAs for paid plans', async ({ page }) => {
    await page.goto(`${BASE_URL}/en/pricing`)
    const subscribeLinks = page.getByRole('link', { name: 'Subscribe' })
    // Two paid plans (Plus and Pro) each get a Subscribe CTA
    await expect(subscribeLinks).toHaveCount(2)
  })

  test('should redirect protected routes to login', async ({ page }) => {
    const protectedRoutes = ['/analyses', '/new', '/settings']
    
    for (const route of protectedRoutes) {
      await page.goto(`${BASE_URL}${route}`)
      // Should redirect to login
      await expect(page).toHaveURL(`${BASE_URL}/login`)
    }
  })

  test('should show 404 for invalid routes', async ({ page }) => {
    await page.goto(`${BASE_URL}/invalid-route`)
    
    // Should show 404 page
    await expect(page.locator('text=404')).toBeVisible()
  })
})
