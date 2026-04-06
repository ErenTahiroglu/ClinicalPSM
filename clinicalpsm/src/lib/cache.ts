import { createClient } from '@/lib/supabase/server'
import type { PsmResult, PsmConfig } from '@/lib/psm/types'

export interface CacheEntry {
  result: PsmResult
  timestamp: number
  userId: string
  configHash: string
  dataHash: string
}

export interface AnalysisCache {
  get(key: string): Promise<CacheEntry | null>
  set(key: string, entry: CacheEntry, ttlMs?: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  cleanup(): Promise<void>
}

/**
 * In-memory cache implementation for development/testing
 */
export class MemoryCache implements AnalysisCache {
  private cache = new Map<string, CacheEntry>()
  private ttlMap = new Map<string, NodeJS.Timeout>()

  async get(key: string): Promise<CacheEntry | null> {
    return this.cache.get(key) || null
  }

  async set(key: string, entry: CacheEntry, ttlMs = 60 * 60 * 1000): Promise<void> {
    // Clear existing TTL if any
    const existingTtl = this.ttlMap.get(key)
    if (existingTtl) {
      clearTimeout(existingTtl)
    }

    // Set new entry
    this.cache.set(key, entry)

    // Set TTL
    const timeout = setTimeout(() => {
      this.cache.delete(key)
      this.ttlMap.delete(key)
    }, ttlMs)
    
    this.ttlMap.set(key, timeout)
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
    const ttl = this.ttlMap.get(key)
    if (ttl) {
      clearTimeout(ttl)
      this.ttlMap.delete(key)
    }
  }

  async clear(): Promise<void> {
    // Clear all TTLs
    for (const ttl of this.ttlMap.values()) {
      clearTimeout(ttl)
    }
    this.ttlMap.clear()
    this.cache.clear()
  }

  async cleanup(): Promise<void> {
    // In-memory cache doesn't need explicit cleanup
  }

  getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

/**
 * Supabase-based cache implementation for production
 */
export class SupabaseCache implements AnalysisCache {
  private supabase: Awaited<ReturnType<typeof createClient>>
  private readonly tableName = 'analysis_cache'

  static async create(): Promise<SupabaseCache> {
    const supabase = await createClient()
    return new SupabaseCache(supabase)
  }

  private constructor(supabase: Awaited<ReturnType<typeof createClient>>) {
    this.supabase = supabase
  }

  async get(key: string): Promise<CacheEntry | null> {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('result, timestamp, user_id, config_hash, data_hash')
        .eq('key', key)
        .gt('expires_at', new Date().toISOString())
        .single()

      if (error || !data) {
        return null
      }

      return {
        result: data.result,
        timestamp: new Date(data.timestamp).getTime(),
        userId: data.user_id,
        configHash: data.config_hash,
        dataHash: data.data_hash,
      }
    } catch (error) {
      console.error('Cache get error:', error)
      return null
    }
  }

  async set(key: string, entry: CacheEntry, ttlMs = 60 * 60 * 1000): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + ttlMs).toISOString()

      const { error } = await this.supabase
        .from(this.tableName)
        .upsert({
          key,
          result: entry.result,
          timestamp: new Date(entry.timestamp).toISOString(),
          user_id: entry.userId,
          config_hash: entry.configHash,
          data_hash: entry.dataHash,
          expires_at: expiresAt,
        })

      if (error) {
        console.error('Cache set error:', error)
      }
    } catch (error) {
      console.error('Cache set error:', error)
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.supabase
        .from(this.tableName)
        .delete()
        .eq('key', key)
    } catch (error) {
      console.error('Cache delete error:', error)
    }
  }

  async clear(): Promise<void> {
    try {
      await this.supabase
        .from(this.tableName)
        .delete()
        .neq('key', 'never') // Delete all records
    } catch (error) {
      console.error('Cache clear error:', error)
    }
  }

  async cleanup(): Promise<void> {
    try {
      await this.supabase
        .from(this.tableName)
        .delete()
        .lt('expires_at', new Date().toISOString())
    } catch (error) {
      console.error('Cache cleanup error:', error)
    }
  }
}

/**
 * Cache manager with automatic cache selection
 */
export class CacheManager {
  private static instance: CacheManager
  private cache: AnalysisCache
  private initialized: boolean = false

  private constructor() {
    // Start with memory cache, will switch to Supabase if needed
    this.cache = new MemoryCache()
  }

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager()
    }
    return CacheManager.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return
    
    if (process.env.NODE_ENV === 'production') {
      try {
        this.cache = await SupabaseCache.create()
      } catch (error) {
        console.warn('Failed to initialize Supabase cache, falling back to memory cache:', error)
        this.cache = new MemoryCache()
      }
    }
    
    this.initialized = true
  }

  getCache(): AnalysisCache {
    if (!this.initialized) {
      console.warn('Cache not initialized, using memory cache')
    }
    return this.cache
  }

  async getCacheStats(): Promise<{ type: string; stats?: any }> {
    await this.initialize()
    
    if (this.cache instanceof MemoryCache) {
      return {
        type: 'memory',
        stats: this.cache.getStats(),
      }
    }
    
    return {
      type: 'supabase',
    }
  }
}

/**
 * Generate cache key for PSM analysis
 */
export function generateCacheKey(
  userId: string,
  config: PsmConfig,
  dataHash: string
): string {
  const configHash = hashObject(config)
  return `psm:${userId}:${configHash}:${dataHash}`
}

/**
 * Simple hash function for objects
 */
export function hashObject(obj: any): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort())
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}

/**
 * Cache middleware for PSM analysis
 */
export function withCache<T extends Record<string, any>>(
  handler: (
    req: Request,
    context: { params: Promise<T> },
    cacheKey: string
  ) => Promise<Response>
) {
  return async (req: Request, context: { params: Promise<T> }): Promise<Response> => {
    const cache = CacheManager.getInstance().getCache()
    
    // Try to get cache key from request body or query params
    let cacheKey: string | undefined
    
    try {
      if (req.method === 'POST') {
        const body = await req.json()
        cacheKey = body.cacheKey
      } else if (req.method === 'GET') {
        const url = new URL(req.url)
        cacheKey = url.searchParams.get('cacheKey') || undefined
      }
    } catch {
      // If we can't parse the request, skip caching
    }

    if (cacheKey) {
      // Try to get from cache
      const cached = await cache.get(cacheKey)
      if (cached) {
        return Response.json({
          result: cached.result,
          cached: true,
          timestamp: cached.timestamp,
        })
      }
    }

    // Execute handler and cache result if cacheKey is provided
    const response = await handler(req, context, cacheKey || '')

    // Cache successful responses
    if (cacheKey && response.ok) {
      try {
        const clonedResponse = response.clone()
        const result = await clonedResponse.json()
        
        if (result.result) {
          const userId = result.userId || 'anonymous'
          const configHash = result.configHash || hashObject(result.config || {})
          const dataHash = result.dataHash || hashObject(result.dataHash || {})
          
          await cache.set(cacheKey, {
            result: result.result,
            timestamp: Date.now(),
            userId,
            configHash,
            dataHash,
          })
        }
      } catch (error) {
        // Don't let caching errors break the response
        console.error('Failed to cache response:', error)
      }
    }

    return response
  }
}

/**
 * Helper function to cache PSM results
 */
export const cachePSMResult = async (
  userId: string,
  config: PsmConfig,
  dataHash: string,
  result: PsmResult,
  ttlMs = 60 * 60 * 1000 // 1 hour default
): Promise<void> => {
  const cache = CacheManager.getInstance().getCache()
  const cacheKey = generateCacheKey(userId, config, dataHash)
  const configHash = hashObject(config)
  
  await cache.set(cacheKey, {
    result,
    timestamp: Date.now(),
    userId,
    configHash,
    dataHash,
  }, ttlMs)
}

/**
 * Helper function to get cached PSM results
 */
export const getCachedPSMResult = async (
  userId: string,
  config: PsmConfig,
  dataHash: string
): Promise<PsmResult | null> => {
  const cache = CacheManager.getInstance().getCache()
  const cacheKey = generateCacheKey(userId, config, dataHash)
  
  const cached = await cache.get(cacheKey)
  return cached?.result || null
}

/**
 * Clear cache for a specific user
 */
export const clearUserCache = async (userId: string): Promise<void> => {
  // This would need to be implemented based on the cache backend
  // For Supabase, you'd delete rows where user_id matches
  console.log(`Clearing cache for user: ${userId}`)
}

/**
 * Cleanup expired cache entries
 */
export const cleanupCache = async (): Promise<void> => {
  const cache = CacheManager.getInstance().getCache()
  await cache.cleanup()
}
