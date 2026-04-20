import { test, expect } from './fixtures/auth'
import { test as baseTest } from '@playwright/test'

const testEmail = 'test@clinicalpsm.com'
const testPassword = 'TestPassword123!'

test.describe('Authentication', () => {
  test.skip('should allow user to register and auto-login', async ({ page }) => {
    // Skipped due to rate limiting in production environment
  })

  test.beforeEach(async ({ supabase }) => {
    // Ensure test user exists and has a profile before logging in
    const { data: user } = await supabase.auth.admin.listUsers()
    const existing = user.users.find((u: any) => u.email === testEmail)
    
    let userId = existing?.id
    if (!existing) {
      const { data: newUser } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true
      })
      userId = newUser.user?.id
    }

    if (userId) {
      await supabase.from('profiles').upsert({
        user_id: userId,
        plan: 'free',
        analyses_limit: 1
      }, { onConflict: 'user_id' })
    }
  })

  test('should allow user to login with test account', async ({ page }) => {
    await page.goto('/login')
    
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    await page.click('button[type="submit"]')
    
    await expect(page).toHaveURL('/analyses')
    await expect(page.locator('h1')).toContainText('Analyses')
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

  test.skip('should validate email format', async ({ page }) => {
    // Registration validation tests skipped as per registration skip strategy
  })

  test.skip('should validate password strength', async ({ page }) => {
    // Registration validation tests skipped as per registration skip strategy
  })

  test.skip('should validate password confirmation', async ({ page }) => {
    // Registration validation tests skipped as per registration skip strategy
  })
})

// ---------------------------------------------------------------------------
// .edu academic badge — TR/EN parity
// No auth required; tests only the register form UI.
// ---------------------------------------------------------------------------

baseTest.describe('.edu academic badge on register page', () => {
  baseTest('EN: Academic ✓ badge appears for .edu address', async ({ page }) => {
    await page.goto('/en/register')
    await page.fill('input[name="email"]', 'researcher@mit.edu')
    await expect(page.getByText('Academic ✓')).toBeVisible()
  })

  baseTest('EN: badge disappears when non-.edu address is typed', async ({ page }) => {
    await page.goto('/en/register')
    await page.fill('input[name="email"]', 'researcher@mit.edu')
    await expect(page.getByText('Academic ✓')).toBeVisible()
    await page.fill('input[name="email"]', 'me@gmail.com')
    await expect(page.getByText('Academic ✓')).not.toBeVisible()
  })

  baseTest('EN: hint line is always visible regardless of email', async ({ page }) => {
    await page.goto('/en/register')
    await expect(page.getByText(/institutional.*\.edu/i)).toBeVisible()
    await page.fill('input[name="email"]', 'me@gmail.com')
    await expect(page.getByText(/institutional.*\.edu/i)).toBeVisible()
  })

  baseTest('TR: Akademik ✓ badge appears for .edu.tr address', async ({ page }) => {
    await page.goto('/tr/register')
    await page.fill('input[name="email"]', 'arastirmaci@bogazici.edu.tr')
    await expect(page.getByText('Akademik ✓')).toBeVisible()
  })

  baseTest('TR: badge disappears when non-.edu address is typed', async ({ page }) => {
    await page.goto('/tr/register')
    await page.fill('input[name="email"]', 'arastirmaci@bogazici.edu.tr')
    await expect(page.getByText('Akademik ✓')).toBeVisible()
    await page.fill('input[name="email"]', 'ben@gmail.com')
    await expect(page.getByText('Akademik ✓')).not.toBeVisible()
  })

  baseTest('TR: hint line is always visible regardless of email', async ({ page }) => {
    await page.goto('/tr/register')
    await expect(page.getByText(/Kurumsal.*\.edu/)).toBeVisible()
    await page.fill('input[name="email"]', 'ben@gmail.com')
    await expect(page.getByText(/Kurumsal.*\.edu/)).toBeVisible()
  })

  baseTest('EN badge, not TR text on EN page', async ({ page }) => {
    await page.goto('/en/register')
    await page.fill('input[name="email"]', 'user@uni.ac.uk')
    await expect(page.getByText('Academic ✓')).toBeVisible()
    await expect(page.getByText('Akademik ✓')).not.toBeVisible()
  })

  baseTest('TR badge, not EN text on TR page', async ({ page }) => {
    await page.goto('/tr/register')
    await page.fill('input[name="email"]', 'user@uni.ac.uk')
    await expect(page.getByText('Akademik ✓')).toBeVisible()
    await expect(page.getByText('Academic ✓')).not.toBeVisible()
  })

  baseTest('.ac.uk domain also triggers badge on EN page', async ({ page }) => {
    await page.goto('/en/register')
    await page.fill('input[name="email"]', 'phd@ox.ac.uk')
    await expect(page.getByText('Academic ✓')).toBeVisible()
  })
})
