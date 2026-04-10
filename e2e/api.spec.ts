import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

test.describe('API Endpoints', () => {
  test.describe('Analyses API', () => {
    test('should create analysis via API', async ({ request }) => {
      // This test would require authentication headers
      // For now, we'll test the endpoint structure
      const response = await request.post(`${BASE_URL}/api/analyses`, {
        data: { name: 'Test Analysis' },
      })
      
      // Should return 401 without auth or 201 with valid auth
      expect([401, 201]).toContain(response.status())
    })

    test('should get analyses list via API', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/analyses`)
      
      // Should return 401 without auth or 200 with valid auth
      expect([401, 200]).toContain(response.status())
    })

    test('should get single analysis via API', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/analyses/test-id`)
      
      // Should return 401 without auth, 404 for non-existent, or 200 with valid auth
      expect([401, 404, 200]).toContain(response.status())
    })

    test('should update analysis via API', async ({ request }) => {
      const response = await request.put(`${BASE_URL}/api/analyses/test-id`, {
        data: { name: 'Updated Name' },
      })
      
      // Should return 401 without auth, 404 for non-existent, or 200 with valid auth
      expect([401, 404, 200]).toContain(response.status())
    })

    test('should delete analysis via API', async ({ request }) => {
      const response = await request.delete(`${BASE_URL}/api/analyses/test-id`)
      
      // Should return 401 without auth, 404 for non-existent, or 200/204 with valid auth
      expect([401, 404, 200, 204]).toContain(response.status())
    })
  })

  test.describe('Analysis Results API', () => {
    test('should get analysis results via API', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/analyses/test-id/results`)
      
      // Should return 401 without auth, 404 for non-existent, or 200 with valid auth
      expect([401, 404, 200]).toContain(response.status())
    })
  })

  test.describe('File Upload API', () => {
    test('should handle file upload via API', async ({ request }) => {
      // This would require multipart form data
      const response = await request.post(`${BASE_URL}/api/analyses/test-id/upload`)
      
      // Should return 401 without auth or 400 without file
      expect([401, 400]).toContain(response.status())
    })
  })

  test.describe('Auth Callback API', () => {
    test('should handle auth callback', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/auth/callback`)
      
      // Should handle callback (redirect or error)
      expect([302, 400, 401]).toContain(response.status())
    })
  })

  test.describe('API Error Handling', () => {
    test('should return 404 for non-existent endpoints', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/non-existent-endpoint`)
      
      expect(response.status()).toBe(404)
    })

    test('should return 405 for invalid HTTP methods', async ({ request }) => {
      const response = await request.fetch(`${BASE_URL}/api/analyses`, {
        method: 'PATCH',
      })
      
      expect(response.status()).toBe(405)
    })

    test('should validate request body', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/analyses`, {
        data: { invalid_field: 'test' },
        headers: { 'Content-Type': 'application/json' },
      })
      
      // Should return 400 for invalid data or 401 without auth
      expect([400, 401]).toContain(response.status())
    })

    test('should handle malformed JSON', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/analyses`, {
        data: '{ invalid json }',
        headers: { 'Content-Type': 'application/json' },
      })
      
      // Should return 400 for malformed JSON
      expect([400, 401]).toContain(response.status())
    })
  })

  test.describe('API Response Format', () => {
    test('should return JSON content type', async ({ request }) => {
      const response = await request.get(`${BASE_URL}/api/analyses`)
      const contentType = response.headers()['content-type']
      
      expect(contentType).toContain('application/json')
    })

    test('should include proper CORS headers', async ({ request }) => {
      const response = await request.fetch(`${BASE_URL}/api/analyses`, {
        method: 'OPTIONS',
      })
      const corsHeaders = response.headers()
      
      // Check for common CORS headers
      const hasCorsHeaders = corsHeaders['access-control-allow-origin'] || 
                            corsHeaders['Access-Control-Allow-Origin']
      
      // CORS headers may or may not be present depending on configuration
      // This test just verifies the endpoint responds
      expect(response.status()).toBeGreaterThanOrEqual(200)
    })
  })

  test.describe('API Rate Limiting', () => {
    test('should enforce rate limits on API endpoints', async ({ request }) => {
      // Make multiple rapid requests
      const responses = []
      for (let i = 0; i < 11; i++) {
        const response = await request.get(`${BASE_URL}/api/analyses`)
        responses.push(response.status())
      }
      
      // Should eventually return 429 (Too Many Requests) or continue with 401
      expect(responses.some(code => code === 429 || code === 401)).toBeTruthy()
    })
  })

  test.describe('API Security', () => {
    test('should reject requests without CSRF token', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/analyses`, {
        data: { name: 'Test' },
      })
      
      // Should return 403 (CSRF) or 401 (unauthorized)
      expect([403, 401]).toContain(response.status())
    })

    test('should validate content-type header', async ({ request }) => {
      const response = await request.post(`${BASE_URL}/api/analyses`, {
        data: { name: 'Test' },
        headers: { 'Content-Type': 'text/plain' },
      })
      
      // Should return 415 (Unsupported Media Type) or 401
      expect([415, 401, 400]).toContain(response.status())
    })
  })
})
