import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function logPlanChanged(
  adminClient: SupabaseClient,
  userId: string,
  metadata: { toPlan: string; subscriptionId?: string; fromPlan?: string }
): Promise<void> {
  try {
    await adminClient.from('audit_logs').insert({
      user_id: userId,
      action: 'PLAN_CHANGED',
      resource_type: 'profile',
      resource_id: userId,
      metadata,
      timestamp: new Date().toISOString(),
    })
  } catch {
    console.error('[Audit] Failed to log plan change for', userId)
  }
}

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

/**
 * Keys that may carry clinical content or identifiers. Stripped from every
 * audit entry regardless of caller (defense in depth, CP-00 R1).
 */
const FORBIDDEN_AUDIT_KEYS = new Set([
  'filename', 'file_name', 'filepath', 'file_path', 'columnnames', 'column_names',
  'body', 'payload', 'rows', 'data', 'stack', 'error_stack', 'error_message', 'message',
])

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_AUDIT_KEYS.has(k.toLowerCase())) continue
      out[k] = sanitizeAuditMetadata(v)
    }
    return out
  }
  return value
}

/**
 * Audit writes use the trusted service-role client. audit_logs has no client
 * RLS policies or grants (migration 011), so a user-session client cannot write
 * or read it. A fresh stateless client is created per write: no cached user
 * session can leak between requests.
 */
export class AuditLogger {
  private static instance: AuditLogger

  static async getInstance(): Promise<AuditLogger> {
    if (!AuditLogger.instance) AuditLogger.instance = new AuditLogger()
    return AuditLogger.instance
  }

  async log(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    try {
      const auditEntry: AuditLogEntry = {
        ...entry,
        metadata: entry.metadata
          ? (sanitizeAuditMetadata(entry.metadata) as Record<string, unknown>)
          : undefined,
        timestamp: new Date().toISOString(),
      }

      const { error } = await createAdminClient().from('audit_logs').insert(auditEntry)

      if (error) {
        // Never print metadata: only the action and an error code.
        console.error('[Audit] Database log error:', error.code ?? 'unknown', auditEntry.action)
      }
    } catch {
      console.error('[Audit] Unexpected error while writing audit log')
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
      // Name only: messages and stacks can embed fragments of request payloads.
      metadata: {
        error_name: error.name,
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
