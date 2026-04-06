import { NextRequest } from 'next/server'
import { auditLog } from '@/lib/audit'

export interface ErrorContext {
  userId?: string
  analysisId?: string
  action?: string
  method?: string
  url?: string
  userAgent?: string
  ip?: string
  [key: string]: any
}

export interface ErrorAlert {
  error: Error
  context: ErrorContext
  severity: 'low' | 'medium' | 'high' | 'critical'
  timestamp: string
  fingerprint: string
}

export class ErrorMonitor {
  private static instance: ErrorMonitor
  private errorCounts: Map<string, { count: number; lastAlert: number }> = new Map()
  
  private constructor() {}

  static getInstance(): ErrorMonitor {
    if (!ErrorMonitor.instance) {
      ErrorMonitor.instance = new ErrorMonitor()
    }
    return ErrorMonitor.instance
  }

  /**
   * Generate a unique fingerprint for an error based on message and stack trace
   */
  private generateFingerprint(error: Error): string {
    const message = error.message
    const stack = error.stack || ''
    
    // Take first few lines of stack trace to identify similar errors
    const stackLines = stack.split('\n').slice(0, 5).join('\n')
    
    // Simple hash function
    const combined = `${message}|${stackLines}`
    let hash = 0
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    
    return hash.toString(36)
  }

  /**
   * Determine error severity based on error type and context
   */
  private determineSeverity(error: Error, context: ErrorContext): 'low' | 'medium' | 'high' | 'critical' {
    const message = error?.message || ''
    
    // Critical errors
    if (message.includes('database') || message.includes('connection')) {
      return 'critical'
    }
    
    // High severity errors
    if (message.includes('unauthorized') || 
        message.includes('authentication') ||
        message.includes('security') ||
        context.action?.includes('payment') ||
        context.action?.includes('delete')) {
      return 'high'
    }
    
    // Medium severity errors
    if (message.includes('validation') ||
        message.includes('not found') ||
        message.includes('rate limit')) {
      return 'medium'
    }
    
    // Default to low
    return 'low'
  }

  /**
   * Check if we should send an alert based on error frequency
   */
  private shouldAlert(fingerprint: string): boolean {
    const now = Date.now()
    const existing = this.errorCounts.get(fingerprint)
    
    if (!existing) {
      this.errorCounts.set(fingerprint, { count: 1, lastAlert: now })
      return true
    }
    
    const timeSinceLastAlert = now - existing.lastAlert
    const alertCooldown = 5 * 60 * 1000 // 5 minutes
    
    if (timeSinceLastAlert > alertCooldown) {
      this.errorCounts.set(fingerprint, { count: existing.count + 1, lastAlert: now })
      return true
    }
    
    // Alert if error count exceeds threshold
    if (existing.count >= 10) {
      this.errorCounts.set(fingerprint, { count: existing.count + 1, lastAlert: now })
      return true
    }
    
    this.errorCounts.set(fingerprint, { count: existing.count + 1, lastAlert: existing.lastAlert })
    return false
  }

  /**
   * Monitor and potentially alert on an error
   */
  async monitorError(error: Error | string | unknown, context: ErrorContext, request?: NextRequest): Promise<void> {
    // Convert non-Error objects to Error instances
    const errorObj = error instanceof Error ? error : new Error(String(error))
    
    const fingerprint = this.generateFingerprint(errorObj)
    const severity = this.determineSeverity(errorObj, context)
    
    const alert: ErrorAlert = {
      error: errorObj,
      context,
      severity,
      timestamp: new Date().toISOString(),
      fingerprint,
    }

    // Always log to audit system
    await auditLog.errorOccurred(errorObj, context, request)

    // Check if we should send an alert
    if (this.shouldAlert(fingerprint)) {
      await this.sendAlert(alert)
    }

    // Console logging for development
    if (process.env.NODE_ENV === 'development') {
      console.error(`[${severity.toUpperCase()}] ${errorObj.message}`, {
        context,
        fingerprint,
        timestamp: alert.timestamp,
      })
    }
  }

  /**
   * Send alert to external monitoring systems
   */
  private async sendAlert(alert: ErrorAlert): Promise<void> {
    try {
      // In production, you would integrate with services like:
      // - Sentry
      // - DataDog
      // - PagerDuty
      // - Slack
      // - Email notifications
      
      if (process.env.NODE_ENV === 'production') {
        // Example: Send to webhook or monitoring service
        await this.sendToWebhook(alert)
      }
      
      // Always log critical errors
      if (alert.severity === 'critical') {
        console.error('CRITICAL ERROR:', {
          message: alert.error.message,
          stack: alert.error.stack,
          context: alert.context,
          fingerprint: alert.fingerprint,
          timestamp: alert.timestamp,
        })
      }
    } catch (webhookError) {
      // Don't let monitoring errors break the application
      console.error('Failed to send error alert:', webhookError)
    }
  }

  /**
   * Send alert to webhook endpoint
   */
  private async sendToWebhook(alert: ErrorAlert): Promise<void> {
    // This is a placeholder - implement based on your monitoring solution
    const webhookUrl = process.env.ERROR_WEBHOOK_URL
    
    if (!webhookUrl) return

    const payload = {
      service: 'clinicalpsm',
      environment: process.env.NODE_ENV,
      severity: alert.severity,
      error: {
        message: alert.error.message,
        stack: alert.error.stack,
        fingerprint: alert.fingerprint,
      },
      context: alert.context,
      timestamp: alert.timestamp,
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }).catch(() => {
      // Silently fail webhook requests to avoid infinite loops
    })
  }

  /**
   * Get error statistics
   */
  getErrorStats(): { [fingerprint: string]: { count: number; lastAlert: number } } {
    return Object.fromEntries(this.errorCounts)
  }

  /**
   * Clear error statistics (useful for testing)
   */
  clearStats(): void {
    this.errorCounts.clear()
  }
}

/**
 * Middleware to automatically monitor errors in API routes
 */
export function withErrorMonitoring<T extends Record<string, any>>(
  handler: (req: Request, context: { params: Promise<T> }) => Promise<Response>,
  getContext?: (req: Request, context: { params: Promise<T> }) => ErrorContext
) {
  return async (req: Request, context: { params: Promise<T> }): Promise<Response> => {
    try {
      return await handler(req, context)
    } catch (error) {
      const errorContext = getContext?.(req, context) || {
        method: req.method,
        url: req.url,
        userAgent: req.headers.get('user-agent') || undefined,
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
      }

      await ErrorMonitor.getInstance().monitorError(
        error instanceof Error ? error : new Error('Unknown error'),
        errorContext,
        req as NextRequest
      )

      // Re-throw the error to be handled by other middleware
      throw error
    }
  }
}

/**
 * Convenience function to monitor errors
 */
export const monitorError = (
  error: Error | string | unknown,
  context: ErrorContext,
  request?: NextRequest
): Promise<void> => {
  return ErrorMonitor.getInstance().monitorError(error, context, request)
}

/**
 * Get error monitor instance for advanced usage
 */
export const getErrorMonitor = (): ErrorMonitor => {
  return ErrorMonitor.getInstance()
}
