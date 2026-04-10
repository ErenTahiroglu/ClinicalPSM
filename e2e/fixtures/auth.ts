import { test as base, expect, type Page, type TestInfo } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Test user credentials
const TEST_USER = {
  email: 'test@clinicalpsm.com',
  password: 'TestPassword123!',
}

type AuthFixtures = {
  authenticatedPage: Page
  supabase: SupabaseClient
  user: { id: string; email: string }
}

export const test = base.extend<AuthFixtures>({
  supabase: async ({}, use) => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    await use(supabase)
  },

  user: async ({ supabase }, use) => {
    // Ensure test user exists and is confirmed via Admin API
    const listResult = await supabase.auth.admin.listUsers()
    if (listResult.error) throw new Error(`Supabase Admin Error: ${listResult.error.message}`)
    
    let existing = listResult.data.users.find((u: any) => u.email === TEST_USER.email)
    
    if (!existing) {
      const createResult = await supabase.auth.admin.createUser({
        email: TEST_USER.email,
        password: TEST_USER.password,
        email_confirm: true
      })
      if (createResult.error) throw new Error(`Supabase Admin Create Error: ${createResult.error.message}`)
      existing = createResult.data.user
    } else {
      const updateResult = await supabase.auth.admin.updateUserById(existing.id, {
        password: TEST_USER.password,
        email_confirm: true
      })
      if (updateResult.error) throw new Error(`Supabase Admin Update Error: ${updateResult.error.message}`)
    }

    if (!existing) throw new Error('User missing')

    // Ensure profile exists (without dropped analyses_used column)
    const { error: profileError } = await supabase.from('profiles').upsert({
      user_id: existing.id,
      plan: 'free',
      analyses_limit: 1 // Default for free plan
    })
    
    if (profileError) {
      console.warn(`[Fixture Setup] Profile ensure failed: ${profileError.message}. Continuing...`)
    }

    await use({ id: existing.id, email: existing.email! })
  },

  authenticatedPage: async ({ page, user }, use) => {
    // First ensure we're logged out
    await page.goto('/login')
    
    // Login with test user
    await page.fill('input[type="email"]', user.email)
    await page.fill('input[type="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')
    
    // Wait for login to complete
    await expect(page).toHaveURL('/analyses')
    await expect(page.locator('h1')).toContainText('Analyses')
    
    await use(page)
  },
})

export { expect }
export type { Page, TestInfo }
