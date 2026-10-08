import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Audit logging with a closed, allowlisted schema (CP-00 R2).
 *
 * Only explicitly listed event types and metadata fields are persisted, each with
 * a validator that accepts bounded scalars (UUIDs, small integers, enum members,
 * short tokens). Everything else is dropped, regardless of key name or nesting:
 * a denylist cannot protect against clinical content hidden under an unexpected key.
 *
 * Never persisted: filenames/paths, request bodies, column names/values, exception
 * messages or stacks, URLs, user-agent strings, free-text descriptions, full IPs.
 *
 * Writes use a stateless service-role client (audit_logs has no client grants,
 * migration 011/012).
 */

type Validator = (v: unknown) => unknown | undefined

const uuid: Validator = v =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
    ? v.toLowerCase()
    : undefined
const int = (max: number): Validator => v =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max ? v : undefined
const oneOf = (...values: string[]): Validator => v =>
  typeof v === 'string' && values.includes(v) ? v : undefined
const bool: Validator = v => (typeof v === 'boolean' ? v : undefined)
const token: Validator = v =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : undefined

const PLANS = oneOf('free', 'plus', 'pro')
const METHODS = oneOf('GET', 'POST', 'PUT', 'PATCH', 'DELETE')

/** Fixed reason codes replace the former free-text `description`. */
export const SUSPICIOUS_REASONS = [
  'request_size_limit_exceeded',
  'file_size_limit_exceeded',
  'csv_row_limit_exceeded',
  'csrf_validation_failed',
  'unspecified',
] as const
export type SuspiciousReason = (typeof SUSPICIOUS_REASONS)[number]

const REASON_BY_TEXT: Record<string, SuspiciousReason> = {
  'Request size limit exceeded': 'request_size_limit_exceeded',
  'File size limit exceeded': 'file_size_limit_exceeded',
  'CSV row limit exceeded': 'csv_row_limit_exceeded',
  'CSRF token validation failed': 'csrf_validation_failed',
}

const EVENT_SCHEMA = {
  LOGIN: { resource: ['user'], fields: {} },
  LOGOUT: { resource: ['user'], fields: {} },
  ANALYSIS_CREATED: { resource: ['analysis'], fields: { status: oneOf('draft') } },
  ANALYSIS_UPDATED: { resource: ['analysis'], fields: { status: oneOf('draft', 'processing', 'completed', 'failed') } },
  FILE_UPLOADED: {
    resource: ['upload'],
    fields: { analysisId: uuid, fileSize: int(1 << 30), rowCount: int(10_000_000) },
  },
  RATE_LIMIT_EXCEEDED: { resource: ['analysis', 'upload', 'auth', 'security'], fields: { analysisId: uuid } },
  SUSPICIOUS_ACTIVITY: {
    resource: ['security'],
    fields: {
      reason: oneOf(...SUSPICIOUS_REASONS),
      method: METHODS,
      contentLength: int(1 << 40),
      fileSize: int(1 << 40),
      maxSize: int(1 << 40),
      maxFileSize: int(1 << 40),
      rowCount: int(10_000_000),
      maxRows: int(10_000_000),
      hasCsrfHeader: bool,
      hasCsrfCookie: bool,
    },
  },
  ERROR_OCCURRED: { resource: ['system'], fields: { error_name: token, action: token, analysisId: uuid } },
  PLAN_CHANGED: { resource: ['profile'], fields: { toPlan: PLANS, fromPlan: PLANS, subscriptionId: token } },
} as const satisfies Record<string, { resource: readonly string[]; fields: Record<string, Validator> }>

export type AuditAction = keyof typeof EVENT_SCHEMA

export interface AuditLogEntry {
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  ip_address?: string
  metadata?: Record<string, unknown>
  timestamp: string
}

export interface AuditInput {
  user_id: string
  action: string
  resource_type: string
  resource_id?: string
  ip_address?: string
  metadata?: Record<string, unknown>
}

/** Truncate to a network prefix (IPv4 /24, IPv6 /48): enough for abuse triage, not for identification. */
export function truncateIp(ip: string | undefined | null): string | undefined {
  if (!ip) return undefined
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/24`
  if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(':')) {
    const groups = ip.split(':').slice(0, 3)
    if (groups.length === 3 && groups.every(g => /^[0-9a-fA-F]{0,4}$/.test(g))) return `${groups.join(':')}::/48`
  }
  return undefined
}

/**
 * Build the persisted record from an allowlist. Returns null for unknown event
 * types (dropped, never persisted with unvalidated content).
 */
export function buildAuditEntry(input: AuditInput): Omit<AuditLogEntry, 'timestamp'> | null {
  const schema = (EVENT_SCHEMA as Record<string, { resource: readonly string[]; fields: Record<string, Validator> }>)[
    input.action
  ]
  if (!schema) return null

  const userId = input.user_id === 'system' ? 'system' : uuid(input.user_id)
  if (!userId) return null

  const resourceType = schema.resource.includes(input.resource_type) ? input.resource_type : schema.resource[0]

  const metadata: Record<string, unknown> = {}
  for (const [key, validate] of Object.entries(schema.fields)) {
    const out = validate(input.metadata?.[key])
    if (out !== undefined) metadata[key] = out
  }

  return {
    user_id: userId as string,
    action: input.action,
    resource_type: resourceType,
    resource_id: uuid(input.resource_id) as string | undefined,
    ip_address: truncateIp(input.ip_address),
    metadata,
  }
}

async function write(client: SupabaseClient, input: AuditInput): Promise<void> {
  try {
    const entry = buildAuditEntry(input)
    if (!entry) {
      console.error('[Audit] Dropped event with unsupported type or user id')
      return
    }
    const { error } = await client.from('audit_logs').insert({ ...entry, timestamp: new Date().toISOString() })
    if (error) console.error('[Audit] Database log error:', error.code ?? 'unknown', entry.action)
  } catch {
    console.error('[Audit] Unexpected error while writing audit log')
  }
}

/** Billing audit. `adminClient` must be the trusted service-role client. */
export async function logPlanChanged(
  adminClient: SupabaseClient,
  userId: string,
  metadata: { toPlan: string; subscriptionId?: string; fromPlan?: string }
): Promise<void> {
  await write(adminClient, {
    user_id: userId,
    action: 'PLAN_CHANGED',
    resource_type: 'profile',
    resource_id: userId,
    metadata,
  })
}

function clientIp(request?: Request): string | undefined {
  if (!request) return undefined
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    undefined
  )
}

export class AuditLogger {
  private static instance: AuditLogger

  static async getInstance(): Promise<AuditLogger> {
    if (!AuditLogger.instance) AuditLogger.instance = new AuditLogger()
    return AuditLogger.instance
  }

  private async client(): Promise<SupabaseClient | null> {
    try {
      return createAdminClient()
    } catch {
      console.error('[Audit] Service-role client unavailable; audit event dropped')
      return null
    }
  }

  async log(entry: AuditInput): Promise<void> {
    const c = await this.client()
    if (c) await write(c, entry)
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
      ip_address: clientIp(request),
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
      user_id: 'system',
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: clientIp(request),
      metadata,
    })
  }

  async logError(error: Error, context: Record<string, unknown>, request?: Request): Promise<void> {
    await this.log({
      user_id: 'system',
      action: 'ERROR_OCCURRED',
      resource_type: 'system',
      ip_address: clientIp(request),
      // Name only: messages and stacks can embed fragments of request payloads.
      metadata: { error_name: error.name, ...context },
    })
  }
}

// Convenience functions for the supported audit events
export const auditLog = {
  userLogin: async (userId: string, request?: Request) => {
    await (await AuditLogger.getInstance()).logUserAction(userId, 'LOGIN', 'user', userId, {}, request)
  },

  userLogout: async (userId: string, request?: Request) => {
    await (await AuditLogger.getInstance()).logUserAction(userId, 'LOGOUT', 'user', userId, {}, request)
  },

  analysisCreated: async (userId: string, analysisId: string, metadata?: Record<string, unknown>, request?: Request) => {
    await (await AuditLogger.getInstance()).logUserAction(userId, 'ANALYSIS_CREATED', 'analysis', analysisId, metadata, request)
  },

  analysisUpdated: async (userId: string, analysisId: string, metadata?: Record<string, unknown>, request?: Request) => {
    await (await AuditLogger.getInstance()).logUserAction(userId, 'ANALYSIS_UPDATED', 'analysis', analysisId, metadata, request)
  },

  fileUploaded: async (userId: string, uploadId: string, metadata?: Record<string, unknown>, request?: Request) => {
    await (await AuditLogger.getInstance()).logUserAction(userId, 'FILE_UPLOADED', 'upload', uploadId, metadata, request)
  },

  rateLimitExceeded: async (resourceType: string, resourceId?: string, metadata?: Record<string, unknown>, request?: Request) => {
    await (await AuditLogger.getInstance()).logSecurityEvent('RATE_LIMIT_EXCEEDED', resourceType, resourceId, metadata, request)
  },

  /** `description` is mapped to a fixed reason code; free text is never stored. */
  suspiciousActivity: async (description: string, metadata?: Record<string, unknown>, request?: Request) => {
    const reason = REASON_BY_TEXT[description] ?? 'unspecified'
    await (await AuditLogger.getInstance()).logSecurityEvent(
      'SUSPICIOUS_ACTIVITY',
      'security',
      undefined,
      { ...metadata, reason },
      request
    )
  },

  errorOccurred: async (error: Error, context: Record<string, unknown>, request?: Request) => {
    await (await AuditLogger.getInstance()).logError(error, context, request)
  },
}
