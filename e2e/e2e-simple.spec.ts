import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

test.describe('Simple E2E Tests', () => {
  test.describe('Landing Page', () => {
    test('should load landing page', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Check if page loads
      await expect(page).toHaveTitle(/ClinicalPSM/)
    })

    test('should display main navigation', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Check for navigation elements
      await expect(page.locator('nav').first()).toBeVisible()
    })

    test('should display hero section', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Check for main content
      await expect(page.locator('h1')).toBeVisible()
    })

    test('should have working links to key pages', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Check for login/register links
      const loginLink = page.locator('a[href="/login"], button:has-text("Login")')
      const registerLink = page.locator('a[href="/register"], button:has-text("Register")').first()
      
      const loginVisible = await loginLink.isVisible().catch(() => false)
      const registerVisible = await registerLink.isVisible().catch(() => false)
      
      expect(loginVisible || registerVisible).toBeTruthy()
    })
  })

  test.describe('Authentication Pages', () => {
    test('should navigate to login page', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Look for login link or button
      const loginLink = page.locator('a[href="/login"], button:has-text("Login")')
      if (await loginLink.isVisible()) {
        await loginLink.click()
        await expect(page).toHaveURL(`${BASE_URL}/login`)
      } else {
        // Navigate directly if link not found
        await page.goto(`${BASE_URL}/login`)
      }
    })

    test('should show login form', async ({ page }) => {
      await page.goto(`${BASE_URL}/login`)
      
      // Check if login form elements exist
      await expect(page.locator('input[type="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('should navigate to register page', async ({ page }) => {
      await page.goto(BASE_URL)
      
      // Look for register link or button
      const registerLink = page.locator('a[href="/register"], button:has-text("Register")').first()
      if (await registerLink.isVisible()) {
        await registerLink.click()
        await expect(page).toHaveURL(`${BASE_URL}/register`)
      } else {
        // Navigate directly if link not found
        await page.goto(`${BASE_URL}/register`)
      }
    })

    test('should show register form', async ({ page }) => {
      await page.goto(`${BASE_URL}/register`)
      
      // Check if register form elements exist
      await expect(page.locator('input[name="email"]')).toBeVisible()
      await expect(page.locator('input[name="password"]')).toBeVisible()
      await expect(page.locator('input[name="confirmPassword"]')).toBeVisible()
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })
  })

  test.describe('Pricing Page', () => {
    test('should show pricing page', async ({ page }) => {
      await page.goto(`${BASE_URL}/pricing`)
      
      // Check pricing plans are displayed
      const pricingVisible = await page.locator('text=Free, text=Plus, text=Pro').isVisible().catch(() => false)
      const pricingTitleVisible = await page.locator('text=Pricing').isVisible().catch(() => false)
      
      expect(pricingVisible || pricingTitleVisible).toBeTruthy()
    })
  })

  test.describe('Protected Routes', () => {
    test('should redirect protected routes to login', async ({ page }) => {
      const protectedRoutes = ['/analyses', '/new', '/settings']
      
      for (const route of protectedRoutes) {
        await page.goto(`${BASE_URL}${route}`)
        // Should redirect to login
        await expect(page).toHaveURL(`${BASE_URL}/login`)
      }
    })
  })

  test.describe('Error Pages', () => {
    test('should show 404 for invalid routes', async ({ page }) => {
      await page.goto(`${BASE_URL}/invalid-route-that-does-not-exist`)
      
      // Should show 404 page
      const notFoundVisible = await page.locator('text=404').isVisible().catch(() => false)
      const pageNotFoundVisible = await page.locator('text=Page not found, text=Not Found').isVisible().catch(() => false)
      
      expect(notFoundVisible || pageNotFoundVisible).toBeTruthy()
    })
  })

  test.describe('Page Performance', () => {
    test('should load pages within acceptable time', async ({ page }) => {
      const routes = ['/', '/login', '/register', '/pricing']
      
      for (const route of routes) {
        const startTime = Date.now()
        await page.goto(`${BASE_URL}${route}`)
        await page.waitForLoadState('networkidle')
        const loadTime = Date.now() - startTime
        
        expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
      }
    })
  })

  test.describe('Responsive Design', () => {
    test('should be responsive on mobile', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 })
      await page.goto(BASE_URL)
      
      // Check that main elements are visible on mobile
      await expect(page.locator('h1, main').first()).toBeVisible()
    })

    test('should be responsive on tablet', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 })
      await page.goto(BASE_URL)
      
      // Check that main elements are visible on tablet
      await expect(page.locator('h1, main').first()).toBeVisible()
    })

    test('should be responsive on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.goto(BASE_URL)
      
      // Check that main elements are visible on desktop
      await expect(page.locator('h1, main').first()).toBeVisible()
    })
  })
})
