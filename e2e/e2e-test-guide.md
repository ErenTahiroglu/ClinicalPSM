# ClinicalPSM E2E Testing Guide

## Overview
This guide covers setting up and running End-to-End (E2E) tests for the ClinicalPSM application using Playwright.

## Prerequisites

### Required Dependencies
```bash
npm install --save-dev @playwright/test
# or
yarn add --dev @playwright/test
```

### Browser Installation
```bash
npx playwright install
```

## Test Structure

### 1. Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

### 2. Test Authentication Setup

```typescript
// e2e/fixtures/auth.ts
import { test as base, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Test user credentials
const TEST_USER = {
  email: 'test@clinicalpsm.com',
  password: 'TestPassword123!',
}

type AuthFixtures = {
  authenticatedPage: any
  supabase: any
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login with test user
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    
    // Wait for login to complete
    await expect(page).toHaveURL('/analyses')
    await use(page)
  },
  
  supabase: async ({}, use) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await use(supabase)
  },
})

export { expect }
```

### 3. E2E Test Files

#### Authentication Tests
```typescript
// e2e/auth.spec.ts
import { test, expect } from './fixtures/auth'

test.describe('Authentication', () => {
  test('should allow user to register', async ({ page }) => {
    await page.goto('/register')
    
    const randomEmail = `test-${Date.now()}@clinicalpsm.com`
    
    await page.fill('input[name="email"]', randomEmail)
    await page.fill('input[name="password"]', 'TestPassword123!')
    await page.fill('input[name="confirmPassword"]', 'TestPassword123!')
    await page.click('button[type="submit"]')
    
    // Should redirect to analyses page after successful registration
    await expect(page).toHaveURL('/analyses')
    await expect(page.locator('h1')).toContainText('Analyses')
  })

  test('should allow user to login', async ({ page }) => {
    await page.goto('/login')
    
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    
    await expect(page).toHaveURL('/analyses')
  })

  test('should allow user to logout', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button[aria-label="User menu"]')
    await authenticatedPage.click('text=Logout')
    
    await expect(authenticatedPage).toHaveURL('/login')
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login')
    
    await page.fill('input[type="email"]', 'invalid@email.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')
    
    await expect(page.locator('text=Invalid credentials')).toBeVisible()
  })
})
```

#### PSM Workflow Tests
```typescript
// e2e/psm-workflow.spec.ts
import { test, expect } from './fixtures/auth'
import path from 'path'

test.describe('PSM Analysis Workflow', () => {
  test('should complete full PSM analysis workflow', async ({ authenticatedPage }) => {
    // Navigate to new analysis
    await authenticatedPage.goto('/new')
    
    // Step 1: Basic Information
    await authenticatedPage.fill('input[name="name"]', 'Test PSM Analysis')
    await authenticatedPage.fill('textarea[name="description"]', 'E2E test analysis')
    await authenticatedPage.click('button:has-text("Next")')
    
    // Step 2: Data Upload
    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))
    
    // Wait for file to be processed
    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible()
    await authenticatedPage.click('button:has-text("Next")')
    
    // Step 3: Variable Selection
    await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
    await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    await authenticatedPage.click('text=Age') // Select covariate
    await authenticatedPage.click('text=Gender') // Select another covariate
    await authenticatedPage.click('button:has-text("Next")')
    
    // Step 4: Matching Configuration
    await authenticatedPage.selectOption('select[name="method"]', 'nearest')
    await authenticatedPage.fill('input[name="ratio"]', '1')
    await authenticatedPage.click('button:has-text("Next")')
    
    // Step 5: Review and Run
    await expect(authenticatedPage.locator('text=Review Analysis')).toBeVisible()
    await authenticatedPage.click('button:has-text("Run Analysis")')
    
    // Wait for analysis to complete
    await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 30000 })
    
    // Verify results are displayed
    await expect(authenticatedPage.locator('text=Matched Dataset')).toBeVisible()
    await expect(authenticatedPage.locator('text=Balance Diagnostics')).toBeVisible()
    await expect(authenticatedPage.locator('text=Love Plot')).toBeVisible()
  })

  test('should handle file upload errors', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/new')
    await authenticatedPage.click('button:has-text("Next")') // Skip to data upload
    
    // Try to upload invalid file
    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/invalid-file.txt'))
    
    await expect(authenticatedPage.locator('text=Please upload a CSV file')).toBeVisible()
  })

  test('should validate required fields', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/new')
    
    // Try to proceed without filling required fields
    await authenticatedPage.click('button:has-text("Next")')
    
    await expect(authenticatedPage.locator('text=Name is required')).toBeVisible()
  })
})
```

#### Security Tests
```typescript
// e2e/security.spec.ts
import { test, expect } from './fixtures/auth'

test.describe('Security Features', () => {
  test('should enforce rate limiting', async ({ page }) => {
    // Try multiple rapid login attempts
    for (let i = 0; i < 6; i++) {
      await page.goto('/login')
      await page.fill('input[type="email"]', 'test@example.com')
      await page.fill('input[type="password"]', 'wrongpassword')
      await page.click('button[type="submit"]')
    }
    
    // Should show rate limit message
    await expect(page.locator('text=Too many attempts')).toBeVisible()
  })

  test('should prevent CSRF attacks', async ({ authenticatedPage }) => {
    // Test that CSRF tokens are present in forms
    await authenticatedPage.goto('/new')
    
    const csrfToken = await authenticatedPage.locator('input[name="csrf_token"]')
    await expect(csrfToken).toHaveAttribute('value', /.+/) // Should have a value
  })

  test('should enforce file size limits', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/new')
    await authenticatedPage.click('button:has-text("Next")')
    
    // Try to upload large file (mock)
    const fileInput = authenticatedPage.locator('input[type="file"]')
    // This would need a large test file
    await expect(fileInput).toHaveAttribute('accept', '.csv')
  })

  test('should redirect unauthenticated users', async ({ page }) => {
    const protectedRoutes = ['/analyses', '/new', '/settings']
    
    for (const route of protectedRoutes) {
      await page.goto(route)
      await expect(page).toHaveURL('/login')
    }
  })
})
```

#### Performance Tests
```typescript
// e2e/performance.spec.ts
import { test, expect } from './fixtures/auth'

test.describe('Performance', () => {
  test('should load pages within acceptable time', async ({ page }) => {
    const routes = ['/', '/login', '/register', '/pricing']
    
    for (const route of routes) {
      const startTime = Date.now()
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const loadTime = Date.now() - startTime
      
      expect(loadTime).toBeLessThan(3000) // Should load within 3 seconds
    }
  })

  test('should handle large datasets efficiently', async ({ authenticatedPage }) => {
    // This would test with a larger dataset
    await authenticatedPage.goto('/new')
    
    // Upload larger dataset
    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/large-dataset.csv'))
    
    // Should process within reasonable time
    const startTime = Date.now()
    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible()
    const processingTime = Date.now() - startTime
    
    expect(processingTime).toBeLessThan(10000) // Should process within 10 seconds
  })
})
```

#### Accessibility Tests
```typescript
// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test'
import { injectAxe, checkA11y } from 'axe-playwright'

test.describe('Accessibility', () => {
  test('should be accessible on login page', async ({ page }) => {
    await page.goto('/login')
    await injectAxe(page)
    await checkA11y(page)
  })

  test('should be accessible on analyses page', async ({ page }) => {
    // Login first
    await page.goto('/login')
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    
    await injectAxe(page)
    await checkA11y(page)
  })

  test('should have proper keyboard navigation', async ({ page }) => {
    await page.goto('/login')
    
    // Test tab navigation
    await page.keyboard.press('Tab')
    await expect(page.locator('input[type="email"]')).toBeFocused()
    
    await page.keyboard.press('Tab')
    await expect(page.locator('input[type="password"]')).toBeFocused()
    
    await page.keyboard.press('Tab')
    await expect(page.locator('button[type="submit"]')).toBeFocused()
  })
})
```

### 4. Test Fixtures

```typescript
// e2e/fixtures/test-data.ts
export const SAMPLE_CSV_DATA = `patient_id,treatment,outcome,age,gender
1,0,0.5,65,Male
2,1,0.8,72,Female
3,0,0.3,58,Male
4,1,0.9,69,Female
5,0,0.4,61,Male
6,1,0.7,75,Female
7,0,0.6,63,Male
8,1,0.8,70,Female
9,0,0.5,67,Male
10,1,0.9,73,Female`

export const LARGE_CSV_DATA = Array.from({ length: 1000 }, (_, i) => 
  `${i + 1},${i % 2},${Math.random()},${50 + Math.random() * 30},${i % 2 === 0 ? 'Male' : 'Female'}`
).join('\n')

// Create test files
import fs from 'fs'
import path from 'path'

const fixturesDir = path.join(__dirname, 'fixtures')
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir)
}

fs.writeFileSync(path.join(fixturesDir, 'sample-data.csv'), SAMPLE_CSV_DATA)
fs.writeFileSync(path.join(fixturesDir, 'large-dataset.csv'), `patient_id,treatment,outcome,age,gender\n${LARGE_CSV_DATA}`)
fs.writeFileSync(path.join(fixturesDir, 'invalid-file.txt'), 'This is not a CSV file')
```

### 5. Test Scripts

```json
// package.json scripts
{
  "scripts": {
    "e2e": "playwright test",
    "e2e:ui": "playwright test --ui",
    "e2e:debug": "playwright test --debug",
    "e2e:codegen": "playwright codegen",
    "e2e:install": "playwright install",
    "e2e:report": "playwright show-report"
  }
}
```

### 6. CI/CD Integration

```yaml
# .github/workflows/e2e.yml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install --with-deps
      
      - name: Setup test database
        run: |
          # Setup Supabase local instance or use test database
          # Apply migrations
          # Seed test data
      
      - name: Run E2E tests
        run: npm run e2e
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Running Tests

### Development
```bash
# Run all tests
npm run e2e

# Run specific test file
npm run e2e -- auth.spec.ts

# Run with UI (interactive mode)
npm run e2e:ui

# Debug mode
npm run e2e:debug

# Generate tests with codegen
npm run e2e:codegen
```

### CI/CD
```bash
# Run in headless mode
npx playwright test

# Generate HTML report
npm run e2e:report
```

## Best Practices

### 1. Test Organization
- Group related tests with `test.describe()`
- Use meaningful test names
- Keep tests independent and isolated
- Use fixtures for shared setup

### 2. Data Management
- Use test-specific data
- Clean up test data after each test
- Use deterministic test data
- Mock external services when needed

### 3. Error Handling
- Use proper assertions
- Include helpful error messages
- Take screenshots on failure
- Use retry logic for flaky tests

### 4. Performance
- Use page.waitForLoadState() for timing
- Avoid unnecessary waits
- Use selectors efficiently
- Parallelize tests when possible

### 5. Maintenance
- Keep tests up to date with UI changes
- Regularly review and refactor tests
- Use page object patterns for complex interactions
- Document test purpose and setup

## Troubleshooting

### Common Issues
1. **Timeout Errors**: Increase timeout values or improve selectors
2. **Flaky Tests**: Add proper waits and retry logic
3. **Authentication Issues**: Ensure test user exists and credentials are correct
4. **Database Issues**: Ensure test database is properly set up
5. **Browser Compatibility**: Test across different browsers

### Debugging Tips
- Use `--debug` flag to step through tests
- Take screenshots at key points
- Use `console.log` for debugging
- Check Playwright traces for detailed information

## Coverage Areas

### Critical User Journeys
- [ ] User registration and login
- [ ] Complete PSM analysis workflow
- [ ] Data upload and processing
- [ ] Results visualization and export
- [ ] Subscription management (when implemented)

### Security Testing
- [ ] Authentication and authorization
- [ ] CSRF protection
- [ ] Rate limiting
- [ ] Input validation
- [ ] File upload security

### Performance Testing
- [ ] Page load times
- [ ] Large dataset processing
- [ ] Concurrent user handling
- [ ] Memory usage

### Accessibility Testing
- [ ] WCAG compliance
- [ ] Keyboard navigation
- [ ] Screen reader compatibility
- [ ] Color contrast

This comprehensive E2E testing setup ensures ClinicalPSM works reliably across different browsers, devices, and user scenarios while maintaining security and performance standards.
