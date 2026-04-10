import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { checkRateLimit, rateLimitKey } from '../rate-limit'

// Each test uses a unique key to avoid contamination from the module-level store.
let keyCounter = 0
const uniqueKey = (prefix = 'test') => `${prefix}:key${++keyCounter}`

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('allows the very first request on a new key', () => {
    expect(checkRateLimit(uniqueKey(), 10)).toBe(true)
  })

  it('allows all requests up to the exact limit', () => {
    const key = uniqueKey()
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, 5)).toBe(true)
    }
  })

  it('rejects the request that exceeds the limit', () => {
    const key = uniqueKey()
    for (let i = 0; i < 3; i++) checkRateLimit(key, 3)
    expect(checkRateLimit(key, 3)).toBe(false)
  })

  it('continues to reject while within the same window', () => {
    const key = uniqueKey()
    for (let i = 0; i < 2; i++) checkRateLimit(key, 2)
    expect(checkRateLimit(key, 2)).toBe(false)
    vi.advanceTimersByTime(30_000) // still within 60s window
    expect(checkRateLimit(key, 2)).toBe(false)
  })

  it('resets the counter after the 60-second window expires', () => {
    const key = uniqueKey()
    for (let i = 0; i < 5; i++) checkRateLimit(key, 5) // exhaust
    expect(checkRateLimit(key, 5)).toBe(false)

    vi.advanceTimersByTime(61_000) // past the 60s window

    expect(checkRateLimit(key, 5)).toBe(true) // fresh window
  })

  it('tracks different keys independently', () => {
    const key1 = uniqueKey('routeA')
    const key2 = uniqueKey('routeB')
    for (let i = 0; i < 3; i++) checkRateLimit(key1, 3) // exhaust key1
    expect(checkRateLimit(key1, 3)).toBe(false)
    expect(checkRateLimit(key2, 3)).toBe(true) // key2 unaffected
  })

  it('limit=1 allows exactly one request then blocks', () => {
    const key = uniqueKey()
    expect(checkRateLimit(key, 1)).toBe(true)
    expect(checkRateLimit(key, 1)).toBe(false)
  })
})

describe('rateLimitKey', () => {
  it('formats the key as "route:ip"', () => {
    expect(rateLimitKey('192.168.1.1', 'upload')).toBe('upload:192.168.1.1')
  })

  it('same IP with different routes produces different keys', () => {
    const k1 = rateLimitKey('1.2.3.4', 'create-analysis')
    const k2 = rateLimitKey('1.2.3.4', 'upload')
    expect(k1).not.toBe(k2)
  })

  it('same route with different IPs produces different keys', () => {
    const k1 = rateLimitKey('1.1.1.1', 'upload')
    const k2 = rateLimitKey('2.2.2.2', 'upload')
    expect(k1).not.toBe(k2)
  })
})

describe('Upstash warning', () => {
  it('logs a console.warn when UPSTASH_REDIS_REST_URL is set but in-memory limiter is active', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()

    const origUrl = process.env.UPSTASH_REDIS_REST_URL
    process.env.UPSTASH_REDIS_REST_URL = 'https://fake-upstash-url'

    try {
      await import('../rate-limit')
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RateLimit]')
      )
    } finally {
      process.env.UPSTASH_REDIS_REST_URL = origUrl
      warnSpy.mockRestore()
    }
  })

  it('does NOT log a warning if process is undefined (browser simulation)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.resetModules()

    // Mock global process as undefined
    const originalProcess = global.process
    // @ts-expect-error - global.process is being deleted for browser simulation
    delete global.process

    try {
      await import('../rate-limit')
      expect(warnSpy).not.toHaveBeenCalled()
    } finally {
      global.process = originalProcess
      warnSpy.mockRestore()
    }
  })
})
