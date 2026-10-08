/**
 * Disposable PostgreSQL (PGlite = real Postgres compiled to WASM) with a minimal
 * emulation of the Supabase pieces the migrations depend on:
 *   roles anon / authenticated / service_role(BYPASSRLS), auth.users, auth.uid(),
 *   storage.objects (RLS on), and Supabase's default privileges that GRANT ALL on
 *   new public objects to the API roles (the worst case the migrations must survive).
 *
 * LIMITS: this is NOT Supabase. PostgREST, GoTrue, the Storage API, and the real
 * role memberships/ownership are not present. A run against a real Supabase
 * (local CLI or branch DB) remains a separate gate.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

const MIGRATIONS = join(__dirname, '..', '..', '..', 'supabase', 'migrations')

export function migrationSql(prefix: string): string {
  const f = readdirSync(MIGRATIONS).find(n => n.startsWith(prefix))
  if (!f) throw new Error(`migration ${prefix} not found`)
  return readFileSync(join(MIGRATIONS, f), 'utf8')
}

export const BOOTSTRAP = (withStorage = true) => `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO service_role;
${withStorage ? `
CREATE SCHEMA storage;
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
-- typical permissive dashboard policy (assumption: real one unknown)
CREATE POLICY "authenticated bucket access" ON storage.objects FOR ALL TO authenticated
  USING (true) WITH CHECK (true);
` : ''}
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
`

export async function newDb(opts: { withStorage?: boolean } = {}): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(BOOTSTRAP(opts.withStorage ?? true))
  return db
}

export async function applyMigrations(db: PGlite, prefixes: string[]) {
  for (const p of prefixes) await db.exec(migrationSql(p))
}

export type Actor =
  | { role: 'anon' }
  | { role: 'authenticated'; sub: string }
  | { role: 'service_role' }
  | { role: 'postgres' }

/** Run SQL as a given API role (+ JWT sub), always restoring the superuser. */
export async function as<T = Record<string, unknown>>(
  db: PGlite,
  actor: Actor,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (actor.role !== 'postgres') {
    await db.exec(`SET ROLE ${actor.role}`)
    if (actor.role === 'authenticated') {
      await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [actor.sub])
    } else {
      await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`)
    }
  }
  try {
    const res = await db.query<T>(sql, params)
    return res.rows
  } finally {
    await db.exec('RESET ROLE')
  }
}
