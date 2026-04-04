import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('env configuration', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
  })

  it('loads publicEnv successfully when vars are present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'

    const env = await import('../env')
    expect(env.publicEnv.NEXT_PUBLIC_SUPABASE_URL).toBe('https://fake.supabase.co')
    expect(env.publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBe('fake-anon-key')
  })

  it('throws on load if public vars are missing', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'

    await expect(import('../env')).rejects.toThrow(/Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('getServerEnv succeeds if SERVICE_ROLE_KEY is present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'

    const env = await import('../env')
    expect(env.getServerEnv().SUPABASE_SERVICE_ROLE_KEY).toBe('fake-service-key')
    expect(env.getServerEnv().NEXT_PUBLIC_SUPABASE_URL).toBe('https://fake.supabase.co')
  })

  it('getServerEnv throws on client side (window defined)', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-key'
    
    // Simulate browser window
    vi.stubGlobal('window', {})

    const env = await import('../env')
    expect(() => env.getServerEnv()).toThrow(/called on the client/)
  })

  it('getServerEnv throws if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key'
    delete process.env.SUPABASE_SERVICE_ROLE_KEY

    const env = await import('../env')
    expect(() => env.getServerEnv()).toThrow(/Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY/)
  })
})
