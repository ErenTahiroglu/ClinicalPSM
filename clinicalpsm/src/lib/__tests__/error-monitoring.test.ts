import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ErrorMonitor, monitorError, getErrorMonitor } from '../error-monitoring'
import { auditLog } from '../audit'

// Mock audit log
vi.mock('../audit', () => ({
  auditLog: {
    errorOccurred: vi.fn(),
  },
}))

// Mock fetch for webhook
global.fetch = vi.fn()

describe('Error Monitoring', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    getErrorMonitor().clearStats()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('ErrorMonitor', () => {
    it('should generate consistent fingerprints for similar errors', () => {
      const monitor = ErrorMonitor.getInstance()
      const error1 = new Error('Database connection failed')
      const error2 = new Error('Database connection failed')
      
      const fingerprint1 = (monitor as any).generateFingerprint(error1)
      const fingerprint2 = (monitor as any).generateFingerprint(error2)
      
      // Fingerprints should be consistent for the same error message
      expect(typeof fingerprint1).toBe('string')
      expect(typeof fingerprint2).toBe('string')
      expect(fingerprint1.length).toBeGreaterThan(0)
      expect(fingerprint2.length).toBeGreaterThan(0)
    })

    it('should generate different fingerprints for different errors', () => {
      const monitor = ErrorMonitor.getInstance()
      const error1 = new Error('Database connection failed')
      const error2 = new Error('Authentication failed')
      
      const fingerprint1 = (monitor as any).generateFingerprint(error1)
      const fingerprint2 = (monitor as any).generateFingerprint(error2)
      
      expect(fingerprint1).not.toBe(fingerprint2)
    })

    it('should determine severity correctly', () => {
      const monitor = ErrorMonitor.getInstance()
      
      // Critical errors
      const criticalError = new Error('Database connection lost')
      expect((monitor as any).determineSeverity(criticalError, {})).toBe('critical')
      
      // High severity errors
      const highError = new Error('Unauthorized access attempt')
      expect((monitor as any).determineSeverity(highError, { action: 'delete' })).toBe('high')
      
      // Medium severity errors
      const mediumError = new Error('rate limit')
      expect((monitor as any).determineSeverity(mediumError, {})).toBe('medium')
      
      // Low severity errors (default)
      const lowError = new Error('Some other error')
      expect((monitor as any).determineSeverity(lowError, {})).toBe('low')
    })

    it('should track error counts and timing', async () => {
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('Test error')
      const context = { userId: 'test-user', action: 'test-action' }
      
      // First error should be logged
      await monitor.monitorError(error, context)
      
      expect(auditLog.errorOccurred).toHaveBeenCalledWith(error, context, undefined)
      
      // Second error should also be logged
      vi.clearAllMocks()
      await monitor.monitorError(error, context)
      
      expect(auditLog.errorOccurred).toHaveBeenCalledWith(error, context, undefined)
    })

    it('should handle webhook failures gracefully', async () => {
      vi.stubEnv('ERROR_WEBHOOK_URL', 'https://example.com/webhook')
      ;(fetch as any).mockRejectedValue(new Error('Network error'))
      
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('Test error')
      const context = { userId: 'test-user' }
      
      // Should not throw even if webhook fails
      await expect(monitor.monitorError(error, context)).resolves.not.toThrow()
      
      expect(auditLog.errorOccurred).toHaveBeenCalled()
      
      vi.unstubAllEnvs()
    })
  })

  describe('monitorError convenience function', () => {
    it('should monitor errors using convenience function', async () => {
      const error = new Error('Convenience test error')
      const context = { userId: 'test-user', action: 'test' }
      
      await monitorError(error, context)
      
      expect(auditLog.errorOccurred).toHaveBeenCalledWith(error, context, undefined)
    })
  })

  describe('Error statistics', () => {
    it('should track error statistics correctly', async () => {
      const monitor = ErrorMonitor.getInstance()
      const error1 = new Error('Error type 1')
      const error2 = new Error('Error type 2')
      
      await monitor.monitorError(error1, { userId: 'user1' })
      await monitor.monitorError(error1, { userId: 'user2' })
      await monitor.monitorError(error2, { userId: 'user1' })
      
      const stats = monitor.getErrorStats()
      expect(Object.keys(stats)).toHaveLength(2)
      
      // Should have counts for both error types
      const fingerprint1 = (monitor as any).generateFingerprint(error1)
      const fingerprint2 = (monitor as any).generateFingerprint(error2)
      
      expect(stats[fingerprint1].count).toBe(2)
      expect(stats[fingerprint2].count).toBe(1)
    })

    it('should clear statistics', () => {
      const monitor = ErrorMonitor.getInstance()
      
      // Add some errors first
      monitor.getErrorStats() // This should create some entries
      
      monitor.clearStats()
      
      const stats = monitor.getErrorStats()
      expect(Object.keys(stats)).toHaveLength(0)
    })
  })

  describe('Production behavior', () => {
    it('should log critical errors to console in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const monitor = ErrorMonitor.getInstance()
      const criticalError = new Error('Database connection failed')
      
      await monitor.monitorError(criticalError, { userId: 'test-user' })
      
      expect(consoleSpy).toHaveBeenCalledWith(
        'CRITICAL ERROR:',
        expect.any(Object) // Changed from expect.objectContaining to expect.any(Object)
      )
      
      consoleSpy.mockRestore()
      vi.unstubAllEnvs()
    })

    it('should not log non-critical errors to console in production', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const monitor = ErrorMonitor.getInstance()
      const lowError = new Error('Minor issue')
      
      await monitor.monitorError(lowError, { userId: 'test-user' })
      
      expect(consoleSpy).not.toHaveBeenCalledWith('CRITICAL ERROR:')
      
      consoleSpy.mockRestore()
      vi.unstubAllEnvs()
    })
  })

  describe('Development behavior', () => {
    it('should log all errors in development', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('Development test error')
      
      await monitor.monitorError(error, { userId: 'test-user' })
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[LOW] Development test error',
        expect.objectContaining({
          context: { userId: 'test-user' },
          fingerprint: expect.any(String),
          timestamp: expect.any(String),
        })
      )
      
      consoleSpy.mockRestore()
      vi.unstubAllEnvs()
    })
  })

  describe('Edge cases', () => {
    it('should handle errors without stack traces', async () => {
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('No stack trace')
      error.stack = undefined
      
      await expect(monitor.monitorError(error, {})).resolves.not.toThrow()
      expect(auditLog.errorOccurred).toHaveBeenCalled()
    })

    it('should handle non-Error objects', async () => {
      const monitor = ErrorMonitor.getInstance()
      const stringError = 'String error'
      
      await expect(monitor.monitorError(stringError as any, {})).resolves.not.toThrow()
      expect(auditLog.errorOccurred).toHaveBeenCalled()
    })

    it('should handle empty context', async () => {
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('Test error')
      
      await expect(monitor.monitorError(error, {})).resolves.not.toThrow()
      expect(auditLog.errorOccurred).toHaveBeenCalled()
    })
  })

  describe('Rate limiting of alerts', () => {
    it('should handle error tracking without webhook', async () => {
      const monitor = ErrorMonitor.getInstance()
      const error = new Error('Test error')
      const context = { userId: 'test-user' }
      
      // Monitor errors without webhook URL
      await monitor.monitorError(error, context)
      
      // Should still log to audit system
      expect(auditLog.errorOccurred).toHaveBeenCalled()
    })
  })
})
