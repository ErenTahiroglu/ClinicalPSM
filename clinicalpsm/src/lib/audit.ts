import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface AuditLogEntry {
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  ip_address?: string
  user_agent?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

export class AuditLogger {
  private static instance: AuditLogger
  private supabase: SupabaseClient

  private constructor(supabase: SupabaseClient) {
    this.supabase = supabase
  }

  static async getInstance(): Promise<AuditLogger> {
    if (!AuditLogger.instance) {
      const supabase = await createClient()
      AuditLogger.instance = new AuditLogger(supabase)
    }
    return AuditLogger.instance
  }

  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        ...entry,
        timestamp: new Date().toISOString(),
      }

      const { error } = await this.supabase
        .from('audit_logs')
        .insert(auditEntry)

      if (error) {
        // Only log to console, don't throw or cause server crash
        if (error.code === 'PGRST204' || error.code === 'PGRST205') {
          console.warn('[Audit] Skipping db log: table not found.')
        } else {
          console.error('[Audit] Database log error:', error)
        }
        console.log('[Audit Entry]', auditEntry)
      }
    } catch (error) {
      console.error('[Audit] Unexpected error:', error)
    }
  }

  async logUserAction(
    userId: string,
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
    request?: Request
  ): Promise<void> {
    await this.log({
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: this.getClientIP(request),
      user_agent: request?.headers.get('user-agent') ?? undefined,
      metadata,
    })
  }

  async logSecurityEvent(
    action: string,
    resourceType: string,
    resourceId?: string,
    metadata?: Record<string, unknown>,
    request?: Request
  ): Promise<void> {
    await this.log({
      user_id: 'system', // Security events can be system-generated
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: this.getClientIP(request),
      user_agent: request?.headers.get('user-agent') ?? undefined,
      metadata: {
        ...metadata,
        security_event: true,
      },
    })
  }

  async logError(
    error: Error,
    context: Record<string, unknown>,
    request?: Request
  ): Promise<void> {
    await this.log({
      user_id: 'system',
      action: 'ERROR_OCCURRED',
      resource_type: 'system',
      metadata: {
        error_message: error.message,
        error_stack: error.stack,
        ...context,
      },
      ip_address: this.getClientIP(request),
      user_agent: request?.headers.get('user-agent') ?? undefined,
    })
  }

  private getClientIP(request?: Request): string | undefined {
    if (!request) return undefined
    
    return (
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      request.headers.get('cf-connecting-ip') ||
      undefined
    )
  }
}

// Convenience functions for common audit actions
export const auditLog = {
  userLogin: async (userId: string, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction(
      userId,
      'LOGIN',
      'user',
      userId,
      {},
      request
    )
  },

  userLogout: async (userId: string, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction(
      userId,
      'LOGOUT',
      'user',
      userId,
      {},
      request
    )
  },

  analysisCreated: async (userId: string, analysisId: string, metadata?: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction(
      userId,
      'ANALYSIS_CREATED',
      'analysis',
      analysisId,
      metadata,
      request
    )
  },

  analysisUpdated: async (userId: string, analysisId: string, metadata?: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction(
      userId,
      'ANALYSIS_UPDATED',
      'analysis',
      analysisId,
      metadata,
      request
    )
  },

  fileUploaded: async (userId: string, uploadId: string, metadata?: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logUserAction(
      userId,
      'FILE_UPLOADED',
      'upload',
      uploadId,
      metadata,
      request
    )
  },

  rateLimitExceeded: async (resourceType: string, resourceId?: string, metadata?: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logSecurityEvent(
      'RATE_LIMIT_EXCEEDED',
      resourceType,
      resourceId,
      metadata,
      request
    )
  },

  suspiciousActivity: async (description: string, metadata?: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logSecurityEvent(
      'SUSPICIOUS_ACTIVITY',
      'security',
      undefined,
      { description, ...metadata },
      request
    )
  },

  errorOccurred: async (error: Error, context: Record<string, unknown>, request?: Request) => {
    const logger = await AuditLogger.getInstance()
    await logger.logError(error, context, request)
  },
}
