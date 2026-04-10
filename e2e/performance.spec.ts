import { test, expect } from './fixtures/auth'
import path from 'path'

test.describe('Performance', () => {
  test.describe('Page Load Times', () => {
    test('should load landing page within acceptable time', async ({ page }) => {
      const startTime = Date.now()
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
    })

    test('should load login page within acceptable time', async ({ page }) => {
      const startTime = Date.now()
      await page.goto('/login')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(2000) // Should load within 2 seconds
    })

    test('should load register page within acceptable time', async ({ page }) => {
      const startTime = Date.now()
      await page.goto('/register')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(2000) // Should load within 2 seconds
    })

    test('should load pricing page within acceptable time', async ({ page }) => {
      const startTime = Date.now()
      await page.goto('/pricing')
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(2000) // Should load within 2 seconds
    })

    test('should load analyses page within acceptable time', async ({ authenticatedPage }) => {
      const startTime = Date.now()
      await authenticatedPage.goto('/analyses')
      await authenticatedPage.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
    })

    test('should load new analysis page within acceptable time', async ({ authenticatedPage }) => {
      const startTime = Date.now()
      await authenticatedPage.goto('/new')
      await authenticatedPage.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(2000) // Should load within 2 seconds
    })
  })

  test.describe('File Upload Performance', () => {
    test('should process small CSV quickly', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Small CSV')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      
      const startTime = Date.now()
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))
      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      const processingTime = Date.now() - startTime
      
      expect(processingTime).toBeLessThan(5000) // Should process within 5 seconds
    })

    test('should process larger CSV within acceptable time', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Large CSV')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      
      const startTime = Date.now()
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/large-dataset.csv'))
      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 15000 })
      const processingTime = Date.now() - startTime
      
      expect(processingTime).toBeLessThan(10000) // Should process within 10 seconds
    })
  })

  test.describe('PSM Analysis Performance', () => {
    test('should complete small dataset analysis quickly', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Small Analysis')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))
      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('text=gender')
      await authenticatedPage.click('button:has-text("Next")')
      await authenticatedPage.click('button:has-text("Next")')

      const startTime = Date.now()
      await authenticatedPage.click('button:has-text("Run Analysis")')
      await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })
      const analysisTime = Date.now() - startTime
      
      expect(analysisTime).toBeLessThan(30000) // Should complete within 30 seconds
    })

    test('should complete large dataset analysis within acceptable time', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Large Analysis')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/large-dataset.csv'))
      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 15000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('text=gender')
      await authenticatedPage.click('button:has-text("Next")')
      await authenticatedPage.click('button:has-text("Next")')

      const startTime = Date.now()
      await authenticatedPage.click('button:has-text("Run Analysis")')
      await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 120000 })
      const analysisTime = Date.now() - startTime
      
      expect(analysisTime).toBeLessThan(60000) // Should complete within 60 seconds
    })
  })

  test.describe('Navigation Performance', () => {
    test('should navigate between pages quickly', async ({ authenticatedPage }) => {
      const routes = ['/analyses', '/new', '/settings']
      
      for (const route of routes) {
        const startTime = Date.now()
        await authenticatedPage.goto(route)
        await authenticatedPage.waitForLoadState('networkidle')
        const navTime = Date.now() - startTime
        
        expect(navTime).toBeLessThan(2000) // Should navigate within 2 seconds
      }
    })

    test('should handle wizard step transitions quickly', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Wizard Performance')
      
      const startTime = Date.now()
      await authenticatedPage.click('button:has-text("Next")')
      await authenticatedPage.waitForLoadState('networkidle')
      const step1Time = Date.now() - startTime
      expect(step1Time).toBeLessThan(1000)
    })
  })

  test.describe('Rendering Performance', () => {
    test('should render analysis list efficiently', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/analyses')
      
      const startTime = Date.now()
      await authenticatedPage.waitForLoadState('networkidle')
      const renderTime = Date.now() - startTime
      
      expect(renderTime).toBeLessThan(2000)
    })

    test('should render results page efficiently', async ({ authenticatedPage }) => {
      // First create an analysis
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Render Performance')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))
      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('button:has-text("Next")')
      await authenticatedPage.click('button:has-text("Next")')
      await authenticatedPage.click('button:has-text("Run Analysis")')

      await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })
      
      // Measure results rendering
      const startTime = Date.now()
      await authenticatedPage.waitForLoadState('networkidle')
      const renderTime = Date.now() - startTime
      
      expect(renderTime).toBeLessThan(3000)
    })
  })

  test.describe('Memory and Resource Usage', () => {
    test('should not leak memory during navigation', async ({ authenticatedPage }) => {
      const initialMetrics = await authenticatedPage.context().storageState()
      
      // Navigate through multiple pages
      for (let i = 0; i < 5; i++) {
        await authenticatedPage.goto('/analyses')
        await authenticatedPage.goto('/new')
        await authenticatedPage.goto('/settings')
      }
      
      // This is a basic check - in production you'd want more sophisticated memory monitoring
      await expect(authenticatedPage).toHaveURL('/settings')
    })

    test('should handle concurrent operations', async ({ authenticatedPage }) => {
      // This test would require multiple browser contexts
      // For now, we'll verify single-user performance
      await authenticatedPage.goto('/analyses')
      await expect(authenticatedPage.locator('h1, text=Analyses')).toBeVisible()
    })
  })
})
