# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: daily-limit.spec.ts >> Daily Analysis Limit >> should enforce 1 analysis per day for free users and reset after UTC midnight
- Location: e2e/daily-limit.spec.ts:11:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=1 / 1 daily analyses used')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=1 / 1 daily analyses used')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - link "ClinicalPSM" [ref=e5] [cursor=pointer]:
          - /url: /
        - navigation [ref=e6]:
          - link "Dashboard" [ref=e7] [cursor=pointer]:
            - /url: /analyses
          - link "Pricing" [ref=e8] [cursor=pointer]:
            - /url: /pricing
          - button "User menu" [ref=e10]: Menu
    - main [ref=e11]:
      - generic [ref=e12]:
        - generic [ref=e13]:
          - generic [ref=e14]:
            - heading "Your Analyses" [level=1] [ref=e15]
            - paragraph [ref=e16]: 0 / 1 daily analyses used
          - link "New Analysis" [ref=e17] [cursor=pointer]:
            - /url: /new
        - generic [ref=e18]:
          - img [ref=e20]
          - paragraph [ref=e22]: No analyses yet
          - paragraph [ref=e23]: Upload a CSV and run your first propensity score matching analysis.
          - link "Start your first analysis →" [ref=e24] [cursor=pointer]:
            - /url: /new
  - alert [ref=e25]
```

# Test source

```ts
  1  | import { test, expect } from './fixtures/auth'
  2  | import { createClient } from '@supabase/supabase-js'
  3  | 
  4  | const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  5  | const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  6  | 
  7  | test.describe('Daily Analysis Limit', () => {
  8  |   // Use a dedicated admin client to cleanup/manipulate data
  9  |   const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  10 | 
  11 |   test('should enforce 1 analysis per day for free users and reset after UTC midnight', async ({ authenticatedPage, user }) => {
  12 |     // 1. Ensure user has NO analyses today
  13 |     const today = new Date()
  14 |     today.setUTCHours(0, 0, 0, 0)
  15 |     
  16 |     await supabaseAdmin
  17 |       .from('analyses')
  18 |       .delete()
  19 |       .eq('user_id', user.id)
  20 |       .gte('created_at', today.toISOString())
  21 | 
  22 |     // 2. Create the first analysis (should work)
  23 |     await authenticatedPage.goto('/analyses')
  24 |     await expect(authenticatedPage.locator('text=0 / 1 daily analyses used')).toBeVisible()
  25 |     
  26 |     await authenticatedPage.click('a:has-text("New Analysis")')
  27 |     await expect(authenticatedPage).toHaveURL('/new')
  28 |     
  29 |     await authenticatedPage.fill('input[name="name"]', 'First Analysis Today')
  30 |     await authenticatedPage.click('button:has-text("Next")')
  31 |     
  32 |     // Successfully reached Step 2
  33 |     await expect(authenticatedPage.locator('text=Step 2: Upload your dataset')).toBeVisible()
  34 | 
  35 |     // 3. Try to create a second analysis (should be blocked)
  36 |     await authenticatedPage.goto('/analyses')
  37 |     // Dynamic usage should now show 1/1
> 38 |     await expect(authenticatedPage.locator('text=1 / 1 daily analyses used')).toBeVisible()
     |                                                                               ^ Error: expect(locator).toBeVisible() failed
  39 |     await expect(authenticatedPage.locator('text=You\'ve used your daily free analysis')).toBeVisible()
  40 |     
  41 |     // "New Analysis" button should be disabled
  42 |     const newBtn = authenticatedPage.locator('span:has-text("New Analysis")')
  43 |     await expect(newBtn).toHaveAttribute('aria-disabled', 'true')
  44 | 
  45 |     // Navigate to /new directly (should show limit reached screen)
  46 |     await authenticatedPage.goto('/new')
  47 |     await expect(authenticatedPage.locator('text=Limit reached')).toBeVisible()
  48 |     await expect(authenticatedPage.locator('text=You\'ve used your daily free analysis')).toBeVisible()
  49 | 
  50 |     // 4. "Time Travel": Move the analysis created today to YESTERDAY in the DB
  51 |     const { data: analyses } = await supabaseAdmin
  52 |       .from('analyses')
  53 |       .select('id')
  54 |       .eq('user_id', user.id)
  55 |       .order('created_at', { ascending: false })
  56 |       .limit(1)
  57 |     
  58 |     if (analyses && analyses.length > 0) {
  59 |       const yesterday = new Date()
  60 |       yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  61 |       
  62 |       await supabaseAdmin
  63 |         .from('analyses')
  64 |         .update({ created_at: yesterday.toISOString() })
  65 |         .eq('id', analyses[0].id)
  66 |     }
  67 | 
  68 |     // 5. Verify limit is reset
  69 |     await authenticatedPage.goto('/analyses')
  70 |     await authenticatedPage.reload() // Ensure fresh data
  71 |     
  72 |     await expect(authenticatedPage.locator('text=0 / 1 daily analyses used')).toBeVisible()
  73 |     await expect(authenticatedPage.locator('a:has-text("New Analysis")')).toBeVisible()
  74 |     
  75 |     await authenticatedPage.click('a:has-text("New Analysis")')
  76 |     await expect(authenticatedPage).toHaveURL('/new')
  77 |     await expect(authenticatedPage.locator('text=Step 1: Basic Information')).toBeVisible()
  78 |   })
  79 | })
  80 | 
```