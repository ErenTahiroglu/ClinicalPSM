/**
 * Tests for src/lib/errors.ts
 *
 * Covers:
 * - ApiError and all subclasses: status codes, message, code property
 * - withErrorHandling: ApiError → typed JSON response, generic Error → 500,
 *   non-Error throws, successful handler pass-through
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitError,
  withErrorHandling,
} from '../errors'

// ---------------------------------------------------------------------------
// ApiError & subclasses
// ---------------------------------------------------------------------------

describe('ApiError', () => {
  it('sets status, message, code and name', () => {
    const err = new ApiError(418, "I'm a teapot", 'TEAPOT')
    expect(err.status).toBe(418)
    expect(err.message).toBe("I'm a teapot")
    expect(err.code).toBe('TEAPOT')
    expect(err.name).toBe('ApiError')
    expect(err instanceof Error).toBe(true)
  })

  it('code is optional and can be undefined', () => {
    const err = new ApiError(500, 'broken')
    expect(err.code).toBeUndefined()
  })
})

describe('UnauthorizedError', () => {
  it('has status 401 and code UNAUTHORIZED', () => {
    const err = new UnauthorizedError()
    expect(err.status).toBe(401)
    expect(err.code).toBe('UNAUTHORIZED')
  })

  it('accepts a custom message', () => {
    const err = new UnauthorizedError('Token expired')
    expect(err.message).toBe('Token expired')
  })

  it('inherits from ApiError', () => {
    expect(new UnauthorizedError() instanceof ApiError).toBe(true)
  })
})

describe('ForbiddenError', () => {
  it('has status 403 and code FORBIDDEN', () => {
    const err = new ForbiddenError()
    expect(err.status).toBe(403)
    expect(err.code).toBe('FORBIDDEN')
  })

  it('accepts a custom message', () => {
    const err = new ForbiddenError('Quota exceeded')
    expect(err.message).toBe('Quota exceeded')
  })
})

describe('NotFoundError', () => {
  it('has status 404 and code NOT_FOUND', () => {
    const err = new NotFoundError()
    expect(err.status).toBe(404)
    expect(err.code).toBe('NOT_FOUND')
  })

  it('accepts a custom message', () => {
    const err = new NotFoundError('Analysis not found')
    expect(err.message).toBe('Analysis not found')
  })
})

describe('ValidationError', () => {
  it('has status 422 and code VALIDATION_ERROR', () => {
    const err = new ValidationError('Invalid field')
    expect(err.status).toBe(422)
    expect(err.code).toBe('VALIDATION_ERROR')
    expect(err.message).toBe('Invalid field')
  })
})

describe('RateLimitError', () => {
  it('has status 429 and code RATE_LIMITED', () => {
    const err = new RateLimitError()
    expect(err.status).toBe(429)
    expect(err.code).toBe('RATE_LIMITED')
  })

  it('accepts custom message', () => {
    const err = new RateLimitError('Slow down!')
    expect(err.message).toBe('Slow down!')
  })
})

// ---------------------------------------------------------------------------
// withErrorHandling
// ---------------------------------------------------------------------------

// Minimal Request stub
function makeRequest(url = 'http://localhost/api/test', method = 'GET'): Request {
  return new Request(url, { method })
}

describe('withErrorHandling', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleSpy.mockRestore()
  })

  it('passes through a successful handler response', async () => {
    const handler = withErrorHandling(async () =>
      Response.json({ ok: true }, { status: 200 })
    )
    const res = await handler(makeRequest())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('converts UnauthorizedError to 401 JSON', async () => {
    const handler = withErrorHandling(async () => {
      throw new UnauthorizedError()
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.code).toBe('UNAUTHORIZED')
    expect(typeof body.error).toBe('string')
  })

  it('converts ForbiddenError to 403 JSON', async () => {
    const handler = withErrorHandling(async () => {
      throw new ForbiddenError('Quota exceeded')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.code).toBe('FORBIDDEN')
    expect(body.error).toBe('Quota exceeded')
  })

  it('converts NotFoundError to 404 JSON', async () => {
    const handler = withErrorHandling(async () => {
      throw new NotFoundError('Analysis missing')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.code).toBe('NOT_FOUND')
  })

  it('converts ValidationError to 422 JSON', async () => {
    const handler = withErrorHandling(async () => {
      throw new ValidationError('Name too long')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('converts RateLimitError to 429 JSON', async () => {
    const handler = withErrorHandling(async () => {
      throw new RateLimitError()
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(429)
    const body = await res.json()
    expect(body.code).toBe('RATE_LIMITED')
  })

  it('converts generic Error to 500 INTERNAL_ERROR', async () => {
    const handler = withErrorHandling(async () => {
      throw new Error('Something exploded')
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERNAL_ERROR')
    expect(body.error).toBe('Internal server error')
  })

  it('converts non-Error throw to 500 INTERNAL_ERROR', async () => {
    const handler = withErrorHandling(async () => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error'
    })
    const res = await handler(makeRequest())
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('INTERNAL_ERROR')
  })

  it('logs unknown errors to console.error', async () => {
    const handler = withErrorHandling(async () => {
      throw new Error('crash')
    })
    await handler(makeRequest())
    expect(consoleSpy).toHaveBeenCalledOnce()
    const [label, details] = consoleSpy.mock.calls[0]
    expect(label).toBe('[API Error]')
    expect(details.error).toBe('crash')
  })

  it('does NOT log ApiError instances to console.error', async () => {
    const handler = withErrorHandling(async () => {
      throw new NotFoundError()
    })
    await handler(makeRequest())
    expect(consoleSpy).not.toHaveBeenCalled()
  })

  it('returns error JSON with both error and code keys', async () => {
    const handler = withErrorHandling(async () => {
      throw new ForbiddenError()
    })
    const res = await handler(makeRequest())
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(['code', 'error'])
  })

  it('falls back to API_ERROR code when ApiError code is undefined', async () => {
    const handler = withErrorHandling(async () => {
      throw new ApiError(418, "teapot") // no code
    })
    const res = await handler(makeRequest())
    const body = await res.json()
    expect(body.code).toBe('API_ERROR')
    expect(res.status).toBe(418)
  })
})
