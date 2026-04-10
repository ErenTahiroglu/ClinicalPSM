import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

// Test user credentials
const TEST_USER = {
  email: 'test@clinicalpsm.com',
  password: 'TestPassword123!',
}

type AuthFixtures = {
  authenticatedPage: Page
  supabase: any
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page, supabase }, use) => {
    // Ensure test user exists and is confirmed via Admin API to stabilize tests
    const listResult = await supabase.auth.admin.listUsers()
    if (listResult.error) throw new Error(`Supabase Admin Error: ${listResult.error.message}`)
    
    const existing = listResult.data.users.find((u: any) => u.email === TEST_USER.email)
    
    if (!existing) {
      const createResult = await supabase.auth.admin.createUser({
        email: TEST_USER.email,
        password: TEST_USER.password,
        email_confirm: true
      })
      if (createResult.error) throw new Error(`Supabase Admin Create Error: ${createResult.error.message}`)
      
      const userId = createResult.data.user?.id
      if (!userId) throw new Error('User ID missing after creation')

      // Ensure profile exists
      const { error: profileError } = await supabase.from('profiles').upsert({
        user_id: userId,
        plan: 'free',
        analyses_used: 0,
        analyses_limit: 10
      })
      if (profileError) throw new Error(`Supabase Profile Create Error: ${profileError.message}`)
    } else {
      const updateResult = await supabase.auth.admin.updateUserById(existing.id, {
        password: TEST_USER.password,
        email_confirm: true
      })
      if (updateResult.error) throw new Error(`Supabase Admin Update Error: ${updateResult.error.message}`)

      // Ensure profile exists for existing user too
      const { error: profileError } = await supabase.from('profiles').upsert({
        user_id: existing.id,
        plan: 'free',
        analyses_used: 0,
        analyses_limit: 10
      })
      if (profileError) throw new Error(`Supabase Profile Update/Ensure Error: ${profileError.message}`)
    }

    // First ensure we're logged out
    await page.goto('/login')
    
    // Login with test user
    await page.fill('input[type="email"]', TEST_USER.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    
    // Wait for login to complete
    await expect(page).toHaveURL('/analyses')
    await expect(page.locator('h1')).toContainText('Analyses')
    
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
export type { Page, TestInfo }
