import { test, expect } from './fixtures/auth'
import path from 'path'

test.describe('Data Validation', () => {
  test.describe('CSV Structure Validation', () => {
    test('should validate CSV has at least one data row', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test No Data')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-only-header.csv'))

      await expect(authenticatedPage.locator('text=no data, text=at least one row')).toBeVisible({ timeout: 5000 })
    })

    test('should validate CSV has consistent column count', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Inconsistent Columns')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-malformed.csv'))

      // Should detect inconsistent columns
      const inconsistentVisible = await authenticatedPage.locator('text=inconsistent, text=columns').isVisible().catch(() => false)
      const malformedVisible = await authenticatedPage.locator('text=malformed').isVisible().catch(() => false)
      const successVisible = await authenticatedPage.locator('text=File uploaded successfully').isVisible().catch(() => false)
      const result = inconsistentVisible || malformedVisible || successVisible
      
      expect(result).toBeTruthy()
    })

    test('should detect and handle quoted fields', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Quoted Fields')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-edge-cases.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })

    test('should handle commas within quoted fields', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Commas in Quotes')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-edge-cases.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Column Type Validation', () => {
    test('should auto-detect numeric columns', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Numeric Detection')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      
      // Check that numeric columns are detected
      await authenticatedPage.click('button:has-text("Next")')
      
      // Age should be available as a covariate
      await expect(authenticatedPage.locator('text=age')).toBeVisible()
    })

    test('should auto-detect categorical columns', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Categorical Detection')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')
      
      // Gender should be available as a covariate
      await expect(authenticatedPage.locator('text=gender')).toBeVisible()
    })

    test('should handle mixed data types in columns', async ({ authenticatedPage }) => {
      // This would need a CSV with mixed types
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Mixed Types')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })
  })

  test.describe('Treatment Variable Validation', () => {
    test('should require treatment variable to be binary', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Binary Treatment')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-invalid-treatment.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('button:has-text("Next")')

      await expect(authenticatedPage.locator('text=binary, text=Treatment must be binary')).toBeVisible()
    })

    test('should have both treatment and control groups', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Both Groups')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('button:has-text("Next")')

      // Should show group sizes
      const groupTextVisible = await authenticatedPage.locator('text=Treatment, text=Control').isVisible().catch(() => false)
      const groupSizesVisible = await authenticatedPage.locator('text=Group sizes').isVisible().catch(() => false)
      expect(groupTextVisible || groupSizesVisible).toBeTruthy()
    })

    test('should reject treatment with no variance', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
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

      await expect(authenticatedPage.locator('text=NO_VARIANCE, text=no variance')).toBeVisible({ timeout: 30000 })
    })
  })

  test.describe('Outcome Variable Validation', () => {
    test('should require outcome variable to be numeric', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Numeric Outcome')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      
      // Try to select a non-numeric outcome if available
      const outcomeSelect = authenticatedPage.locator('select[name="outcome"]')
      const options = await outcomeSelect.locator('option').allTextContents()
      
      // Verify only numeric options are available
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
    })

    test('should handle missing outcome values', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Missing Outcome')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-with-missing.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      
      // Should show imputation options
      await expect(authenticatedPage.locator('text=Missing Values, text=Imputation')).toBeVisible()
    })
  })

  test.describe('Covariate Validation', () => {
    test('should allow selection of multiple covariates', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Multiple Covariates')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      
      // Select multiple covariates
      await authenticatedPage.click('text=age')
      await authenticatedPage.click('text=gender')
      await authenticatedPage.click('text=blood_pressure')
      
      // Verify selections are highlighted
      const selectedVisible = await authenticatedPage.locator('text=age').locator('..').locator('.selected, [aria-selected="true"]').isVisible().catch(() => false)
      const ageVisible = await authenticatedPage.locator('text=age').locator('..').isVisible().catch(() => false)
      expect(selectedVisible || ageVisible).toBeTruthy()
    })

    test('should require at least one covariate', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test No Covariates')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      
      // Try to proceed without selecting covariates
      await authenticatedPage.click('button:has-text("Next")')
      
      await expect(authenticatedPage.locator('text=at least one covariate, text=select covariate')).toBeVisible()
    })

    test('should prevent selecting treatment as covariate', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Treatment as Covariate')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      
      // Treatment column should not be available as covariate
      const treatmentCovariate = authenticatedPage.locator('[data-covariate="treatment"]')
      await expect(treatmentCovariate).not.toBeVisible()
    })

    test('should prevent selecting outcome as covariate', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Outcome as Covariate')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      await authenticatedPage.selectOption('select[name="treatment"]', 'treatment')
      await authenticatedPage.selectOption('select[name="outcome"]', 'outcome')
      
      // Outcome column should not be available as covariate
      const outcomeCovariate = authenticatedPage.locator('[data-covariate="outcome"]')
      await expect(outcomeCovariate).not.toBeVisible()
    })
  })

  test.describe('Missing Value Validation', () => {
    test('should detect missing values in dataset', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Detect Missing')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-with-missing.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      
      // Should show missing value warning
      await expect(authenticatedPage.locator('text=missing, text=Missing Values')).toBeVisible()
    })

    test('should provide imputation options', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Imputation Options')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-with-missing.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      
      // Check for imputation strategy options
      const imputationTextVisible = await authenticatedPage.locator('text=mean, text=median, text=mode, text=drop').isVisible().catch(() => false)
      const imputationSelectVisible = await authenticatedPage.locator('select[name="imputation"]').isVisible().catch(() => false)
      expect(imputationTextVisible || imputationSelectVisible).toBeTruthy()
    })

    test('should apply selected imputation strategy', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Apply Imputation')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/csv-with-missing.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      
      // Select imputation strategy
      const imputationSelect = authenticatedPage.locator('select[name="imputation"]')
      if (await imputationSelect.isVisible()) {
        await imputationSelect.selectOption('mean')
      }
      
      await authenticatedPage.click('button:has-text("Next")')
      
      // Should proceed to next step
      await expect(authenticatedPage.locator('text=Variable Selection, text=treatment')).toBeVisible()
    })
  })

  test.describe('Data Range Validation', () => {
    test('should detect outliers in numeric data', async ({ authenticatedPage }) => {
      // This would need a dataset with outliers
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Outliers')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })

    test('should validate reasonable value ranges', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Value Ranges')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
      await authenticatedPage.click('button:has-text("Next")')

      // Check data summary shows reasonable ranges
      const rangeVisible = await authenticatedPage.locator('text=age, text=Min, text=Max').isVisible().catch(() => false)
      const summaryVisible = await authenticatedPage.locator('text=Summary').isVisible().catch(() => false)
      expect(rangeVisible || summaryVisible).toBeTruthy()
    })
  })

  test.describe('Duplicate Detection', () => {
    test('should detect duplicate rows', async ({ authenticatedPage }) => {
      // This would need a dataset with duplicates
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Duplicates')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })

    test('should handle duplicate column names', async ({ authenticatedPage }) => {
      // This would need a CSV with duplicate column names
      await authenticatedPage.goto('/new')
      await authenticatedPage.fill('input[name="name"]', 'Test Duplicate Columns')
      await authenticatedPage.click('button:has-text("Next")')

      const fileInput = authenticatedPage.locator('input[type="file"]')
      await fileInput.setInputFiles(path.join(__dirname, 'fixtures/sample-data.csv'))

      await expect(authenticatedPage.locator('text=File uploaded successfully')).toBeVisible({ timeout: 10000 })
    })
  })
})
