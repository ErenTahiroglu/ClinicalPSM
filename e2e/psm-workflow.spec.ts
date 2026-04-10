import { test, expect } from './fixtures/auth'
import path from 'path'

test.describe('PSM Analysis Workflow', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Navigate to analyses page
    await authenticatedPage.goto('/analyses')
  })

  test('should complete full PSM analysis workflow', async ({ authenticatedPage }) => {
    // Click "New Analysis" button
    await authenticatedPage.click('button:has-text("New Analysis"), a:has-text("New Analysis")')
    await expect(authenticatedPage).toHaveURL('/new')

    // Step 1: Basic Information
    await authenticatedPage.fill('input[name="name"]', 'E2E Test PSM Analysis')
    await authenticatedPage.fill('textarea[name="description"]', 'Automated end-to-end test analysis')
    await authenticatedPage.click('button:has-text("Next")')

    // Step 2: Data Upload
    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

    // Wait for file to be processed
    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    await authenticatedPage.click('button:has-text("Next")')

    // Step 3: Variable Selection
    // Select treatment variable
    await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
    
    // Select outcome variable
    await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    
    // Select covariates
    await authenticatedPage.click('text=age, [data-covariate="age"]')
    await authenticatedPage.click('text=gender, [data-covariate="gender"]')
    await authenticatedPage.click('text=blood_pressure, [data-covariate="blood_pressure"]')
    await authenticatedPage.click('text=cholesterol, [data-covariate="cholesterol"]')
    
    await authenticatedPage.click('button:has-text("Next")')

    // Step 4: Matching Configuration
    await expect(authenticatedPage.locator('text=Matching Configuration')).toBeVisible()
    
    // Select matching method
    await authenticatedPage.selectOption('select[name="method"]', 'nearest')
    
    // Set matching ratio
    await authenticatedPage.fill('input[name="ratio"]', '1')
    
    // Set caliper (optional)
    const caliperInput = authenticatedPage.locator('input[name="caliper"]')
    if (await caliperInput.isVisible()) {
      await caliperInput.fill('0.2')
    }
    
    await authenticatedPage.click('button:has-text("Next")')

    // Step 5: Review and Run
    await expect(authenticatedPage.locator('text=Review, text=Run Analysis')).toBeVisible()
    
    // Verify summary is displayed
    await expect(authenticatedPage.locator('text=Treatment, text=treatment')).toBeVisible()
    await expect(authenticatedPage.locator('text=Covariates')).toBeVisible()
    
    await authenticatedPage.click('button:has-text("Run Analysis")')

    // Wait for analysis to complete
    await expect(authenticatedPage.locator('text=Analysis completed, text=Results')).toBeVisible({ timeout: 60000 })

    // Verify results are displayed
    await expect(authenticatedPage.locator('text=Matched Dataset')).toBeVisible()
    await expect(authenticatedPage.locator('text=Balance Diagnostics')).toBeVisible()
    await expect(authenticatedPage.locator('text=Love Plot')).toBeVisible()
  })

  test('should handle CSV with missing values', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Analysis"), a:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test Missing Values')
    await authenticatedPage.click('button:has-text("Next")')

    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-with-missing.csv'))

    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    await authenticatedPage.click('button:has-text("Next")')
    
    // Select covariate with missing values to trigger imputation options
    await authenticatedPage.click('text=age')
    
    // Should show missing value imputation options
    await expect(authenticatedPage.locator('text=Missing Values detected, text=Imputation Strategy')).toBeVisible()
    
    // Select imputation strategy
    await authenticatedPage.selectOption('select[name="imputation"]', 'mean')
    await authenticatedPage.click('button:has-text("Next")')

    // Continue with analysis
    await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
    await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    await authenticatedPage.click('text=age')
    await authenticatedPage.click('button:has-text("Next")')
    await authenticatedPage.click('button:has-text("Next")')
    await authenticatedPage.click('button:has-text("Run Analysis")')

    await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })
  })

  test('should validate treatment variable is binary', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test Invalid Treatment')
    await authenticatedPage.click('button:has-text("Next")')

    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-invalid-treatment.csv'))

    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    await authenticatedPage.click('button:has-text("Next")')

    await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
    await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    await authenticatedPage.click('text=age')
    await authenticatedPage.click('button:has-text("Next")')

    // Should show error about non-binary treatment
    await expect(authenticatedPage.locator('text=binary, text=Treatment must be binary')).toBeVisible()
  })

  test('should detect no variance in treatment', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test No Variance')
    await authenticatedPage.click('button:has-text("Next")')

    const fileInput = authenticatedPage.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-no-variance.csv'))

    await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    await authenticatedPage.click('button:has-text("Next")')

    await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
    await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    await authenticatedPage.click('text=age')
    await authenticatedPage.click('button:has-text("Next")')
    await authenticatedPage.click('button:has-text("Next")')
    await authenticatedPage.click('button:has-text("Run Analysis")')

    // Should show error about no variance
    await expect(authenticatedPage.locator('text=no variance, text=NO_VARIANCE')).toBeVisible({ timeout: 30000 })
  })

  test('should export results as CSV', async ({ authenticatedPage }) => {
    // First create and run an analysis
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test Export')
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
    await authenticatedPage.click('button:has-text("Run Analysis")')

    await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })

    // Export matched dataset
    const downloadPromise = authenticatedPage.waitForEvent('download')
    await authenticatedPage.click('button:has-text("Export CSV"), button:has-text("Download CSV")')
    const download = await downloadPromise

    // Verify file was downloaded
    expect(download.suggestedFilename()).toContain('.csv')
  })

  test('should export balance table', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test Balance Export')
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
    await authenticatedPage.click('button:has-text("Run Analysis")')

    await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })

    // Export balance table
    const downloadPromise = authenticatedPage.waitForEvent('download')
    await authenticatedPage.click('button:has-text("Balance Table"), button:has-text("Export Balance")')
    const download = await downloadPromise

    expect(download.suggestedFilename()).toContain('balance')
  })

  test('should display love plot visualization', async ({ authenticatedPage }) => {
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', 'Test Love Plot')
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
    await authenticatedPage.click('button:has-text("Run Analysis")')

    await expect(authenticatedPage.locator('text=Analysis completed')).toBeVisible({ timeout: 60000 })

    // Verify love plot is displayed
    await expect(authenticatedPage.locator('canvas, svg, .love-plot')).toBeVisible()
  })

  test('should save analysis and view in list', async ({ authenticatedPage }) => {
    const analysisName = `Test Analysis ${Date.now()}`
    
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', analysisName)
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

    // Navigate back to analyses list
    await authenticatedPage.click('a:has-text("Analyses"), button:has-text("Back to Analyses")')
    await expect(authenticatedPage).toHaveURL('/analyses')

    // Verify analysis appears in list
    await expect(authenticatedPage.locator(`text=${analysisName}`)).toBeVisible()
  })

  test('should delete analysis', async ({ authenticatedPage }) => {
    // Create an analysis first
    const analysisName = `To Delete ${Date.now()}`
    
    await authenticatedPage.click('button:has-text("New Analysis")')
    await authenticatedPage.fill('input[name="name"]', analysisName)
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

    // Go back to list and delete
    await authenticatedPage.click('a:has-text("Analyses")')
    await expect(authenticatedPage.locator(`text=${analysisName}`)).toBeVisible()

    // Click delete button for the analysis
    const deleteButton = authenticatedPage.locator(`text=${analysisName}`).locator('..').locator('button:has-text("Delete"), [aria-label="Delete"]')
    await deleteButton.click()

    // Confirm deletion
    await authenticatedPage.click('button:has-text("Confirm"), button:has-text("Yes")')

    // Verify analysis is removed
    await expect(authenticatedPage.locator(`text=${analysisName}`)).not.toBeVisible()
  })
})
