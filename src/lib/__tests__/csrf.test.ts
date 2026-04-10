import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { withCSRF, generateCSRFToken, validateCSRFToken } from '../csrf'
import { auditLog } from '../audit'

// Mock audit log
vi.mock('../audit', () => ({
  auditLog: {
    suspiciousActivity: vi.fn(),
  },
}))

describe('CSRF Protection', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('generateCSRFToken', () => {
    it('should generate a unique token each time', () => {
      const token1 = generateCSRFToken()
      const token2 = generateCSRFToken()
      
      expect(token1).not.toBe(token2)
      expect(token1).toMatch(/^[a-f0-9]{64}$/) // 32 bytes = 64 hex chars
    })

    it('should generate tokens of consistent length', () => {
      const tokens = Array.from({ length: 100 }, () => generateCSRFToken())
      
      tokens.forEach(token => {
        expect(token).toHaveLength(64)
        expect(token).toMatch(/^[a-f0-9]+$/)
      })
    })
  })

  describe('validateCSRFToken', () => {
    it('should validate matching tokens', () => {
      const token = generateCSRFToken()
      expect(validateCSRFToken(token, token)).toBe(true)
    })

    it('should reject mismatched tokens', () => {
      const token1 = generateCSRFToken()
      const token2 = generateCSRFToken()
      expect(validateCSRFToken(token1, token2)).toBe(false)
    })

    it('should reject null or undefined tokens', () => {
      expect(validateCSRFToken(null, null)).toBe(false)
      expect(validateCSRFToken(null, null)).toBe(false)
      expect(validateCSRFToken('token', null)).toBe(false)
      expect(validateCSRFToken(null, 'token')).toBe(false)
    })

    it('should reject tokens of different lengths', () => {
      expect(validateCSRFToken('short', 'longer')).toBe(false)
    })
  })

  describe('withCSRF middleware', () => {
    it('should allow GET requests without CSRF check', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { method: 'GET' })
      const response = await wrappedHandler(request)
      
      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response).toBeInstanceOf(Response)
    })

    it('should allow HEAD requests without CSRF check', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { method: 'HEAD' })
      const response = await wrappedHandler(request)
      
      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response).toBeInstanceOf(Response)
    })

    it('should allow OPTIONS requests without CSRF check', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { method: 'OPTIONS' })
      const response = await wrappedHandler(request)
      
      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response).toBeInstanceOf(Response)
    })

    it('should reject POST requests without CSRF token', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      const response = await wrappedHandler(request)
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(403)
      
      const body = await response.json()
      expect(body).toEqual({
        error: 'Invalid CSRF token',
        code: 'CSRF_INVALID'
      })
    })

    it('should reject POST requests with invalid CSRF token', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'invalid-token',
          'Cookie': 'csrf-token=valid-token'
        }
      })
      
      const response = await wrappedHandler(request)
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(403)
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledWith(
        'CSRF token validation failed',
        expect.objectContaining({
          method: 'POST',
          hasCsrfHeader: true,
          hasCsrfCookie: true,
        }),
        request
      )
    })

    it('should allow POST requests with valid CSRF token', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const token = generateCSRFToken()
      const request = new Request('http://example.com', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'Cookie': `csrf-token=${token}`
        }
      })
      
      const response = await wrappedHandler(request)
      
      expect(mockHandler).toHaveBeenCalledWith(request)
      expect(response).toBeInstanceOf(Response)
    })

    it('should handle malformed cookie headers gracefully', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'token',
          'Cookie': 'malformed-cookie'
        }
      })
      
      const response = await wrappedHandler(request)
      
      expect(mockHandler).not.toHaveBeenCalled()
      expect(response.status).toBe(403)
    })

    it('should set CSRF token in GET responses', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { method: 'GET' })
      const response = await wrappedHandler(request)
      
      expect(response.headers.get('X-CSRF-Token')).toBeTruthy()
      expect(response.headers.get('Set-Cookie')).toContain('csrf-token=')
    })

    it('X-CSRF-Token header must equal the cookie token (regression: double-call bug)', async () => {
      // Pre-fix: setCSRFToken was called twice — T1 set in cookie, T2 set in header.
      // After fix: exactly one call, X-CSRF-Token === cookie value.
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)

      const request = new Request('http://example.com', { method: 'GET' })
      const response = await wrappedHandler(request)

      const headerToken = response.headers.get('X-CSRF-Token')
      const setCookie = response.headers.get('Set-Cookie') ?? ''
      // Extract "csrf-token=<value>" from the Set-Cookie string
      const match = setCookie.match(/csrf-token=([^;]+)/)
      const cookieToken = match?.[1] ?? null

      expect(headerToken).toBeTruthy()
      expect(cookieToken).toBeTruthy()
      // The token in the header MUST match the token in the cookie
      expect(headerToken).toBe(cookieToken)
    })

    it('should forward existing cookie token to X-CSRF-Token header without issuing a new cookie', async () => {
      const existingToken = generateCSRFToken()
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)

      const request = new Request('http://example.com', {
        method: 'GET',
        headers: { Cookie: `csrf-token=${existingToken}` },
      })
      const response = await wrappedHandler(request)

      // Header must equal the cookie that was already there
      expect(response.headers.get('X-CSRF-Token')).toBe(existingToken)
      // No new Set-Cookie should be issued (existing token reused)
      expect(response.headers.get('Set-Cookie')).toBeNull()
    })
  })

  describe('CSRF Security', () => {
    it('should use constant-time comparison to prevent timing attacks', async () => {
      const token = generateCSRFToken()
      // Ensure the replacement char always differs from the token's last char.
      // '+ "0"' is flaky: if token ends in '0', similarToken === token and
      // validateCSRFToken correctly returns true, failing the test (~6.25% rate).
      const lastChar = token[token.length - 1]
      const differentChar = lastChar === '0' ? '1' : '0'
      const similarToken = token.slice(0, -1) + differentChar // Change last character
      
      // These should both be false but take similar time
      const start1 = performance.now()
      const result1 = validateCSRFToken(token, similarToken)
      const end1 = performance.now()
      
      const start2 = performance.now()
      const result2 = validateCSRFToken(token, 'completely-different')
      const end2 = performance.now()
      
      expect(result1).toBe(false)
      expect(result2).toBe(false)
      
      // Time difference should be small (less than 1ms)
      const timeDiff1 = end1 - start1
      const timeDiff2 = end2 - start2
      expect(Math.abs(timeDiff1 - timeDiff2)).toBeLessThan(1)
    })

    it('should log suspicious activity for repeated failures', async () => {
      const mockHandler = vi.fn().mockResolvedValue(new Response('success'))
      const wrappedHandler = withCSRF(mockHandler)
      
      const request = new Request('http://example.com', { 
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': 'invalid',
          'Cookie': 'csrf-token=also-invalid'
        }
      })
      
      // Make multiple failed requests
      for (let i = 0; i < 3; i++) {
        await wrappedHandler(request)
      }
      
      expect(auditLog.suspiciousActivity).toHaveBeenCalledTimes(3)
    })
  })
})
