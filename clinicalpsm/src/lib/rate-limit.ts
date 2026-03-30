/**
 * Simple in-memory sliding-window rate limiter.
 * Works per-process (suitable for single-instance / serverless cold-starts).
 * For multi-instance production use, replace with Redis/Upstash.
 */

interface Window {
  count: number
  resetAt: number
}

const store = new Map<string, Window>()

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
