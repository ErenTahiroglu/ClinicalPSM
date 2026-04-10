# ClinicalPSM E2E Test Suite Summary

## Overview
Comprehensive end-to-end test suite for ClinicalPSM application covering all critical user journeys, security features, error handling, data validation, performance, and API endpoints.

## Test Files Created

### 1. **psm-workflow.spec.ts** - PSM Analysis Workflow Tests
**Purpose**: Test the complete Propensity Score Matching analysis workflow from start to finish.

**Test Coverage**:
- Complete PSM analysis workflow (data upload → variable selection → matching → results)
- CSV with missing values handling
- Treatment variable validation (binary requirement)
- No variance detection
- Results export (CSV, balance table)
- Love plot visualization
- Analysis save and view in list
- Analysis deletion

**Test Count**: 9 tests

### 2. **security.spec.ts** - Security Tests
**Purpose**: Verify security features including authentication, rate limiting, CSRF protection, and input validation.

**Test Coverage**:
- **Authentication**:
  - Protected route redirection
  - Invalid credential handling
  - SQL injection prevention
  - XSS prevention
- **Rate Limiting**:
  - Login attempt rate limiting
  - Analysis creation rate limiting
  - File upload rate limiting
- **CSRF Protection**:
  - CSRF token presence in forms
  - Request rejection without valid CSRF token
- **Input Validation**:
  - Email format validation
  - Password strength requirements
  - Password confirmation matching
  - File upload sanitization
- **Session Security**:
  - Proper logout functionality
  - Session invalidation
- **Authorization**:
  - Prevention of accessing other users' data
  - Prevention of modifying other users' data
- **Secure Headers**:
  - Security header validation

**Test Count**: 20+ tests

### 3. **error-handling.spec.ts** - Error Handling Tests
**Purpose**: Ensure the application handles errors gracefully and provides user-friendly error messages.

**Test Coverage**:
- **File Upload Errors**:
  - Non-CSV file rejection
  - Empty file handling
  - CSV with only header
  - Malformed CSV handling
  - Large file size limits
- **PSM Engine Errors**:
  - Insufficient sample size
  - Convergence failure
  - No matches scenario
- **Network Errors**:
  - Network timeout handling
  - Request retry logic
- **Form Validation Errors**:
  - Missing required fields
  - Invalid variable selection
  - Invalid matching parameters
- **API Error Responses**:
  - 404 error handling
  - 500 error handling
  - User-friendly error messages
- **Edge Case Errors**:
  - Special characters in data
  - Very long column names
  - Numeric edge cases
- **Error Recovery**:
  - Retry after error
  - Form data preservation

**Test Count**: 15+ tests

### 4. **data-validation.spec.ts** - Data Validation Tests
**Purpose**: Validate that the application properly validates and processes CSV data.

**Test Coverage**:
- **CSV Structure Validation**:
  - Minimum data row requirement
  - Consistent column count
  - Quoted field handling
  - Commas within quoted fields
- **Column Type Validation**:
  - Numeric column auto-detection
  - Categorical column auto-detection
  - Mixed data type handling
- **Treatment Variable Validation**:
  - Binary requirement
  - Both treatment and control groups
  - Variance requirement
- **Outcome Variable Validation**:
  - Numeric requirement
  - Missing value handling
- **Covariate Validation**:
  - Multiple covariate selection
  - Minimum covariate requirement
  - Treatment as covariate prevention
  - Outcome as covariate prevention
- **Missing Value Validation**:
  - Missing value detection
  - Imputation options
  - Imputation strategy application
- **Data Range Validation**:
  - Outlier detection
  - Reasonable value ranges
- **Duplicate Detection**:
  - Duplicate row detection
  - Duplicate column name handling

**Test Count**: 15+ tests

### 5. **performance.spec.ts** - Performance Tests
**Purpose**: Ensure the application performs within acceptable time limits.

**Test Coverage**:
- **Page Load Times**:
  - Landing page (< 3s)
  - Login page (< 2s)
  - Register page (< 2s)
  - Pricing page (< 2s)
  - Analyses page (< 3s)
  - New analysis page (< 2s)
- **File Upload Performance**:
  - Small CSV processing (< 5s)
  - Large CSV processing (< 10s)
- **PSM Analysis Performance**:
  - Small dataset analysis (< 30s)
  - Large dataset analysis (< 60s)
- **Navigation Performance**:
  - Page-to-page navigation (< 2s)
  - Wizard step transitions (< 1s)
- **Rendering Performance**:
  - Analysis list rendering (< 2s)
  - Results page rendering (< 3s)
- **Memory and Resource Usage**:
  - Memory leak prevention
  - Concurrent operation handling

**Test Count**: 15+ tests

### 6. **api.spec.ts** - API Endpoint Tests
**Purpose**: Test API endpoints for proper functionality, error handling, and security.

**Test Coverage**:
- **Analyses API**:
  - Create analysis
  - Get analyses list
  - Get single analysis
  - Update analysis
  - Delete analysis
- **Analysis Results API**:
  - Get analysis results
- **File Upload API**:
  - File upload handling
- **Auth Callback API**:
  - Auth callback handling
- **API Error Handling**:
  - 404 for non-existent endpoints
  - 405 for invalid HTTP methods
  - Request body validation
  - Malformed JSON handling
- **API Response Format**:
  - JSON content type
  - CORS headers
- **API Rate Limiting**:
  - Rate limit enforcement
- **API Security**:
  - CSRF token validation
  - Content-type validation

**Test Count**: 15+ tests

### 7. **e2e-simple.spec.ts** - Basic Functionality Tests (Updated)
**Purpose**: Simple smoke tests for basic application functionality.

**Test Coverage**:
- **Landing Page**:
  - Page load
  - Navigation display
  - Hero section
  - Working links
- **Authentication Pages**:
  - Login page navigation
  - Login form display
  - Register page navigation
  - Register form display
- **Pricing Page**:
  - Pricing display
- **Protected Routes**:
  - Redirect to login
- **Error Pages**:
  - 404 handling
- **Page Performance**:
  - Load times (< 3s)
- **Responsive Design**:
  - Mobile (375x667)
  - Tablet (768x1024)
  - Desktop (1920x1080)

**Test Count**: 13 tests

### 8. **auth.spec.ts** - Authentication Tests (Existing)
**Purpose**: Test user authentication flow.

**Test Coverage**:
- User registration
- User login
- User logout
- Invalid credential errors
- Email format validation
- Password strength validation
- Password confirmation validation

**Test Count**: 8 tests

### 9. **basic.spec.ts** - Basic Functionality Tests (Existing)
**Purpose**: Test basic application functionality.

**Test Coverage**:
- Landing page load
- Login navigation
- Register navigation
- Pricing page display
- Protected route redirection
- 404 handling

**Test Count**: 6 tests

## Test Data Fixtures

Created comprehensive test data fixtures in `/e2e/fixtures/`:

1. **sample-data.csv** - Standard 20-row dataset with treatment, outcome, and covariates
2. **csv-with-missing.csv** - Dataset with missing values for imputation testing
3. **csv-invalid-treatment.csv** - Dataset with non-binary treatment values
4. **csv-no-variance.csv** - Dataset with no variance in treatment
5. **large-dataset.csv** - 500-row dataset for performance testing
6. **csv-edge-cases.csv** - Dataset with special characters and edge cases
7. **invalid-file.txt** - Non-CSV file for file type validation
8. **csv-only-header.csv** - CSV with only header row
9. **csv-malformed.csv** - CSV with inconsistent column counts

## Total Test Coverage

- **Total Test Files**: 9
- **Total Tests**: 100+ individual test cases
- **Coverage Areas**:
  - ✅ User authentication and authorization
  - ✅ Complete PSM analysis workflow
  - ✅ Data upload and validation
  - ✅ File handling and CSV parsing
  - ✅ Error handling and recovery
  - ✅ Security features (CSRF, rate limiting, input validation)
  - ✅ Performance benchmarks
  - ✅ API endpoint functionality
  - ✅ Responsive design
  - ✅ Edge cases and boundary conditions

## Running the Tests

### Run all E2E tests:
```bash
npm run e2e
```

### Run specific test file:
```bash
npx playwright test psm-workflow.spec.ts
```

### Run with UI (interactive mode):
```bash
npm run e2e:ui
```

### Debug mode:
```bash
npm run e2e:debug
```

### View test report:
```bash
npm run e2e:report
```

## Test Configuration

- **Browser Support**: Chromium, Firefox, WebKit (Desktop Safari)
- **Parallel Execution**: Enabled for faster test runs
- **Retries**: 2 retries in CI, 0 in development
- **Screenshots**: On failure only
- **Traces**: On first retry
- **Base URL**: http://localhost:3000
- **Auto Server**: Starts dev server automatically

## Prerequisites

1. Install dependencies:
```bash
npm install
```

2. Install Playwright browsers:
```bash
npm run e2e:install
```

3. Set up environment variables:
```bash
cp clinicalpsm/.env.local.example clinicalpsm/.env.local
# Fill in Supabase credentials
```

4. Set up test database:
```bash
cd clinicalpsm
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

5. Create test user:
```bash
# The tests expect a test user with:
# Email: test@clinicalpsm.com
# Password: TestPassword123!
```

## Known Limitations

1. Some tests require the application to be fully implemented with specific UI elements
2. Rate limiting tests may need adjustment based on actual rate limit configuration
3. Performance thresholds may need tuning based on server capabilities
4. Some edge case tests may need additional fixture data

## Future Enhancements

- Add accessibility tests (axe-playwright)
- Add visual regression tests
- Add mobile-specific tests
- Add internationalization tests
- Add payment flow tests (when implemented)
- Add more comprehensive API integration tests
- Add load/stress tests for concurrent users

## Maintenance Notes

- Update selectors when UI changes
- Regenerate test data fixtures if CSV format changes
- Adjust performance thresholds as needed
- Keep test data fixtures in sync with application requirements
- Review and update tests regularly as features evolve
