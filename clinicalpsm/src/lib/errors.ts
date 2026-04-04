/**
 * Structured error classes for API routes.
 * Ensures consistent JSON error responses — no raw stack traces reach the client.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN')
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found') {
    super(404, message, 'NOT_FOUND')
  }
}

export class ValidationError extends ApiError {
  constructor(message: string) {
    super(422, message, 'VALIDATION_ERROR')
  }
}

export class RateLimitError extends ApiError {
  constructor(message = 'Too many requests. Please wait a minute.') {
    super(429, message, 'RATE_LIMITED')
  }
}

/**
 * Wraps a Next.js API route handler with standardised error handling.
 * Prevents raw stack traces from leaking to the client.
 *
 * Usage:
 *   export const POST = withErrorHandling(async (req) => { ... })
 */
export function withErrorHandling(
  handler: (req: Request, ctx?: unknown) => Promise<Response>
) {
  return async (req: Request, ctx?: unknown): Promise<Response> => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return Response.json(
          { error: err.message, code: err.code ?? 'API_ERROR' },
          { status: err.status }
        )
      }

      // Unknown error — log but don't expose internals
      console.error('[API Error]', {
        url: req.url,
        method: req.method,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })

      return Response.json(
        { error: 'Internal server error', code: 'INTERNAL_ERROR' },
        { status: 500 }
      )
    }
  }
}
