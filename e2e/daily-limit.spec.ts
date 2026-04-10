import { test, expect } from './fixtures/auth'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

test.describe('Daily Analysis Limit', () => {
  // Use a dedicated admin client to cleanup/manipulate data
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  test('should enforce 1 analysis per day for free users and reset after UTC midnight', async ({ authenticatedPage, user }) => {
    // 1. Ensure user has NO analyses today
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    
    await supabaseAdmin
      .from('analyses')
      .delete()
      .eq('user_id', user.id)
      .gte('created_at', today.toISOString())

    // 2. Create the first analysis (should work)
    await authenticatedPage.goto('/analyses')
    await expect(authenticatedPage.locator('text=0 / 1 daily analyses used')).toBeVisible()
    
    await authenticatedPage.click('a:has-text("New Analysis")')
    await expect(authenticatedPage).toHaveURL('/new')
    
    await authenticatedPage.fill('input[name="name"]', 'First Analysis Today')
    await authenticatedPage.click('button:has-text("Next")')
    
    // Successfully reached Step 2
    await expect(authenticatedPage.locator('text=Step 2: Upload your dataset')).toBeVisible()

    // 3. Try to create a second analysis (should be blocked)
    await authenticatedPage.goto('/analyses')
    // Dynamic usage should now show 1/1
    await expect(authenticatedPage.locator('text=1 / 1 daily analyses used')).toBeVisible()
    await expect(authenticatedPage.locator('text=You\'ve used your daily free analysis')).toBeVisible()
    
    // "New Analysis" button should be disabled
    const newBtn = authenticatedPage.locator('span:has-text("New Analysis")')
    await expect(newBtn).toHaveAttribute('aria-disabled', 'true')

    // Navigate to /new directly (should show limit reached screen)
    await authenticatedPage.goto('/new')
    await expect(authenticatedPage.locator('text=Limit reached')).toBeVisible()
    await expect(authenticatedPage.locator('text=You\'ve used your daily free analysis')).toBeVisible()

    // 4. "Time Travel": Move the analysis created today to YESTERDAY in the DB
    const { data: analyses } = await supabaseAdmin
      .from('analyses')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
    
    if (analyses && analyses.length > 0) {
      const yesterday = new Date()
      yesterday.setUTCDate(yesterday.getUTCDate() - 1)
      
      await supabaseAdmin
        .from('analyses')
        .update({ created_at: yesterday.toISOString() })
        .eq('id', analyses[0].id)
    }

    // 5. Verify limit is reset
    await authenticatedPage.goto('/analyses')
    await authenticatedPage.reload() // Ensure fresh data
    
    await expect(authenticatedPage.locator('text=0 / 1 daily analyses used')).toBeVisible()
    await expect(authenticatedPage.locator('a:has-text("New Analysis")')).toBeVisible()
    
    await authenticatedPage.click('a:has-text("New Analysis")')
    await expect(authenticatedPage).toHaveURL('/new')
    await expect(authenticatedPage.locator('text=Step 1: Basic Information')).toBeVisible()
  })
})
