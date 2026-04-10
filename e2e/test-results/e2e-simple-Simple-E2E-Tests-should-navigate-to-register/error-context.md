# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e-simple.spec.ts >> Simple E2E Tests >> should navigate to register
- Location: e2e-simple.spec.ts:30:7

# Error details

```
Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:3000/
Call log:
  - navigating to "http://localhost:3000/", waiting until "load"

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Simple E2E Tests', () => {
  4  |   test('should load landing page', async ({ page }) => {
  5  |     await page.goto('http://localhost:3000')
  6  |     
  7  |     // Check if page loads
  8  |     await expect(page).toHaveTitle(/ClinicalPSM/)
  9  |   })
  10 | 
  11 |   test('should navigate to login', async ({ page }) => {
  12 |     await page.goto('http://localhost:3000')
  13 |     
  14 |     // Look for login link or button
  15 |     const loginLink = page.locator('a[href="/login"], button:has-text("Login")')
  16 |     if (await loginLink.isVisible()) {
  17 |       await loginLink.click()
  18 |       await expect(page).toHaveURL('http://localhost:3000/login')
  19 |     }
  20 |   })
  21 | 
  22 |   test('should show login form', async ({ page }) => {
  23 |     await page.goto('http://localhost:3000/login')
  24 |     
  25 |     // Check if login form elements exist
  26 |     await expect(page.locator('input[type="email"]')).toBeVisible()
  27 |     await expect(page.locator('input[type="password"]')).toBeVisible()
  28 |   })
  29 | 
  30 |   test('should navigate to register', async ({ page }) => {
> 31 |     await page.goto('http://localhost:3000')
     |                ^ Error: page.goto: net::ERR_EMPTY_RESPONSE at http://localhost:3000/
  32 |     
  33 |     // Look for register link or button
  34 |     const registerLink = page.locator('a[href="/register"], button:has-text("Register")')
  35 |     if (await registerLink.isVisible()) {
  36 |       await registerLink.click()
  37 |       await expect(page).toHaveURL('http://localhost:3000/register')
  38 |     }
  39 |   })
  40 | 
  41 |   test('should show register form', async ({ page }) => {
  42 |     await page.goto('http://localhost:3000/register')
  43 |     
  44 |     // Check if register form elements exist
  45 |     await expect(page.locator('input[name="email"]')).toBeVisible()
  46 |     await expect(page.locator('input[name="password"]')).toBeVisible()
  47 |     await expect(page.locator('input[name="confirmPassword"]')).toBeVisible()
  48 |   })
  49 | })
  50 | 
```