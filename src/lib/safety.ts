/**
 * CP-00 safety hold.
 *
 * Fail-closed by construction: these are compile-time constants, not env vars,
 * feature flags, or database rows. Absent configuration therefore cannot
 * re-enable anything. Lifting the hold requires a reviewed code change
 * (see docs/architecture/CP-00-SAFETY-BASELINE.md).
 */

/** New CSV uploads, new row-level result persistence, new analysis creation. */
export const CLINICAL_WRITES_ENABLED: boolean = false

/** New paid checkouts. Existing subscriptions and webhooks are unaffected. */
export const NEW_PURCHASES_ENABLED: boolean = false

export const CLINICAL_WRITES_SUSPENDED_CODE = 'CLINICAL_DATA_WRITES_SUSPENDED'

/**
 * Generic rejection. Deliberately static: never echoes request content,
 * filenames, column names, or any other caller-supplied value.
 */
export function clinicalWritesSuspendedResponse(): Response {
  return Response.json(
    {
      error:
        'New clinical analyses are temporarily unavailable while a privacy and validation review is in progress.',
      code: CLINICAL_WRITES_SUSPENDED_CODE,
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } }
  )
}

/**
 * Wrap a route handler so it rejects before touching the request body,
 * the session, the database, storage, or the audit log.
 */
export function withClinicalWriteHold<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    if (!CLINICAL_WRITES_ENABLED) return clinicalWritesSuspendedResponse()
    return handler(...args)
  }
}
