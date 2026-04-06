import { NextRequest, NextResponse } from 'next/server'
import { auditLog } from '@/lib/audit'

export class CSRFError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CSRFError'
  }
}

/**
 * Generate a CSRF token for the session
 */
export function generateCSRFToken(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Validate a CSRF token
 */
export function validateCSRFToken(
  token: string | null,
  sessionToken: string | null
): boolean {
  if (!token || !sessionToken) {
    return false
  }
  
  // Constant-time comparison to prevent timing attacks
  if (token.length !== sessionToken.length) {
    return false
  }
  
  let result = 0
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ sessionToken.charCodeAt(i)
  }
  
  return result === 0
}

/**
 * Middleware to enforce CSRF protection for Next.js 16 API routes
 */
export function withCSRFProtection(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    // Skip CSRF check for GET, HEAD, OPTIONS requests
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return await handler(req)
    }

    try {
      // Get CSRF token from headers
      const csrfToken = req.headers.get('x-csrf-token')
      
      // Get session token from cookies (need to parse from headers)
      const cookieHeader = req.headers.get('cookie')
      let sessionToken: string | null = null
      
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=')
          if (key && value) acc[key] = value
          return acc
        }, {} as Record<string, string>)
        
        sessionToken = cookies['csrf-token'] ?? null
      }

      if (!validateCSRFToken(csrfToken, sessionToken)) {
        await auditLog.suspiciousActivity(
          'CSRF token validation failed',
          {
            method: req.method,
            url: req.url,
            userAgent: req.headers.get('user-agent'),
            ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
            hasCsrfHeader: !!csrfToken,
            hasCsrfCookie: !!sessionToken,
          },
          req as NextRequest
        )

        throw new CSRFError('Invalid CSRF token')
      }

      return await handler(req)
    } catch (error) {
      if (error instanceof CSRFError) {
        return Response.json(
          { error: error.message, code: 'CSRF_INVALID' },
          { status: 403 }
        )
      }

      // Re-throw other errors
      throw error
    }
  }
}

/**
 * Set CSRF token in response headers and cookies
 */
export function setCSRFToken(response: Response): string {
  const token = generateCSRFToken()
  
  // Set in cookie via Set-Cookie header
  const cookieValue = `csrf-token=${token}; HttpOnly=false; Secure=${process.env.NODE_ENV === 'production'}; SameSite=strict; Max-Age=${60 * 60 * 24}; Path=/`
  
  if (response instanceof NextResponse) {
    response.cookies.set('csrf-token', token, {
      httpOnly: false, // Allow JavaScript to read for X-CSRF-Token header
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
      path: '/',
    })
  } else {
    response.headers.set('Set-Cookie', cookieValue)
  }

  return token
}

/**
 * Get current CSRF token from request
 */
export function getCSRFToken(req: Request): string | null {
  const cookieHeader = req.headers.get('cookie')
  if (!cookieHeader) return null
  
  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=')
    if (key && value) acc[key] = value
    return acc
  }, {} as Record<string, string>)
  
  return cookies['csrf-token'] ?? null
}

/**
 * Middleware to add CSRF token to GET responses
 */
export function withCSRFToken(
  handler: (req: Request) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const response = await handler(req)

    // Add CSRF token to GET responses
    if (req.method === 'GET') {
      const token = getCSRFToken(req)
      if (!token) {
        setCSRFToken(response)
      }
      
      // Also add token to response headers for easy access
      response.headers.set('X-CSRF-Token', token || setCSRFToken(response))
    }

    return response
  }
}

/**
 * Combined middleware for CSRF protection and token setting
 */
export function withCSRF(
  handler: (req: Request) => Promise<Response>
) {
  return withCSRFToken(withCSRFProtection(handler))
}
