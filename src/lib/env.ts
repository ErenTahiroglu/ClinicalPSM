/**
 * Environment variable validation.
 * Validates required env vars at module load time, throwing descriptive errors
 * rather than cryptic "Cannot read property of undefined" crashes.
 */

interface EnvConfig {
  /** Supabase project URL (public) */
  NEXT_PUBLIC_SUPABASE_URL: string
  /** Supabase anonymous key (public) */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
}

interface ServerEnvConfig extends EnvConfig {
  /** Supabase service role key (server-only, never expose to client) */
  SUPABASE_SERVICE_ROLE_KEY: string
}

function assertEnv(key: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    // Only throw in development/runtime, not during static site generation (build)
    const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
    if (isBuild) {
      console.warn(`[ClinicalPSM] WARNING: Missing required environment variable: ${key} during build.\n` +
        `This is normal if you haven't added variables to Vercel yet, but the app will not work properly at runtime.`)
      return ''
    }
    
    throw new Error(
      `[ClinicalPSM] Missing required environment variable: ${key}\n` +
        `Please add it to your .env.local file.\n` +
        `See .env.local.example for the full list of required variables.`
    )
  }
  return value
}

/**
 * Public environment variables — safe to use in client and server components.
 */
export const publicEnv: EnvConfig = {
  NEXT_PUBLIC_SUPABASE_URL: assertEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL
  ),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: assertEnv(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ),
}

interface PolarEnvConfig {
  POLAR_WEBHOOK_SECRET: string
  POLAR_PLUS_PRODUCT_ID: string
  POLAR_PRO_PRODUCT_ID: string
}

/**
 * Polar-specific server env vars — only assert these when the webhook route runs.
 * Keeps the rest of the app functional when Polar vars are absent in local dev.
 */
export function getPolarEnv(): PolarEnvConfig {
  if (typeof window !== 'undefined') {
    throw new Error('[ClinicalPSM] getPolarEnv() called on client.')
  }
  return {
    POLAR_WEBHOOK_SECRET: assertEnv('POLAR_WEBHOOK_SECRET', process.env.POLAR_WEBHOOK_SECRET),
    POLAR_PLUS_PRODUCT_ID: assertEnv('POLAR_PLUS_PRODUCT_ID', process.env.POLAR_PLUS_PRODUCT_ID),
    POLAR_PRO_PRODUCT_ID: assertEnv('POLAR_PRO_PRODUCT_ID', process.env.POLAR_PRO_PRODUCT_ID),
  }
}

/**
 * Server-only environment variables — NEVER import this in client components.
 * Throws at module load time if any variable is missing.
 */
export function getServerEnv(): ServerEnvConfig {
  // Guard: prevent accidental client-side import
  if (typeof window !== 'undefined') {
    throw new Error(
      '[ClinicalPSM] getServerEnv() was called on the client. ' +
        'SUPABASE_SERVICE_ROLE_KEY must never be exposed to the browser.'
    )
  }

  return {
    ...publicEnv,
    SUPABASE_SERVICE_ROLE_KEY: assertEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.SUPABASE_SERVICE_ROLE_KEY
    ),
  }
}
