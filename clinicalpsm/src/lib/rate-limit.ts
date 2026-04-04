/**
 * In-memory sliding-window rate limiter.
 *
 * ⚠️  PRODUCTION NOTE (B-1):
 * This implementation stores counters per-process. In a multi-instance
 * deployment (e.g. Vercel serverless), each instance maintains its own counter
 * and rate limits are NOT shared across instances.
 *
 * To upgrade to a shared rate limiter:
 *   1. Install:  npm install @upstash/ratelimit @upstash/redis
 *   2. Set env:  UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN
 *   3. Replace checkRateLimit() with Ratelimit.slidingWindow() from @upstash/ratelimit
 *
 * The API surface (checkRateLimit / rateLimitKey) is designed to be a
 * drop-in replacement — callers do not need changes.
 */

interface RateLimitWindow {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitWindow>()

// Warn once at startup if Upstash vars are set but the in-memory limiter is still used
if (
  typeof process !== 'undefined' &&
  process.env.UPSTASH_REDIS_REST_URL &&
  typeof window === 'undefined'
) {
  console.warn(
    '[RateLimit] UPSTASH_REDIS_REST_URL is set but in-memory rate limiter is active. ' +
      'Install @upstash/ratelimit and @upstash/redis to enable shared rate limiting.'
  )
}

/** Returns true if the request is allowed, false if rate-limited. */
export function checkRateLimit(key: string, limitPerMinute: number): boolean {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + 60_000 })
    return true
  }

  if (entry.count >= limitPerMinute) return false

  entry.count++
  return true
}

/** Builds a rate-limit key from an IP string and a route identifier. */
export function rateLimitKey(ip: string, route: string): string {
  return `${route}:${ip}`
}

