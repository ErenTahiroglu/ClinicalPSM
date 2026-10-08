/**
 * Exposure gate: the effective-privilege contract for the public schema.
 * Any new migration that exposes a table, sequence or function to anon/authenticated
 * fails the gate unless this matrix is deliberately changed in the same reviewed PR.
 */
import type { PGlite } from '@electric-sql/pglite'

/** table -> privileges authenticated may hold. anon holds nothing anywhere. */
export const ALLOWED_AUTHENTICATED: Record<string, string[]> = {
  profiles: ['SELECT'],
  analyses: ['SELECT', 'DELETE'],
  uploads: ['SELECT'],
}

export async function findExposureViolations(db: PGlite): Promise<string[]> {
  const out: string[] = []
  const tables = (await db.query<{ t: string }>(`SELECT tablename t FROM pg_tables WHERE schemaname='public'`)).rows.map(r => r.t)
  const ops = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  for (const role of ['anon', 'authenticated']) {
    for (const t of tables) {
      for (const op of ops) {
        const col = ['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'].includes(op)
        const q = col
          ? `SELECT has_any_column_privilege('${role}','public.${t}','${op}') ok`
          : `SELECT has_table_privilege('${role}','public.${t}','${op}') ok`
        const ok = (await db.query<{ ok: boolean }>(q)).rows[0].ok
        const allowed = role === 'authenticated' && (ALLOWED_AUTHENTICATED[t] ?? []).includes(op)
        if (ok !== allowed) out.push(`${role} ${ok ? 'HAS' : 'LACKS'} ${op} on public.${t}`)
      }
    }
    const fns = await db.query<{ n: string }>(
      `SELECT p.oid::regprocedure::text n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND has_function_privilege('${role}', p.oid, 'EXECUTE')`)
    for (const f of fns.rows) out.push(`${role} can EXECUTE ${f.n}`)
    const seqs = await db.query<{ n: string }>(
      `SELECT c.relname n FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind='S'
         AND (has_sequence_privilege('${role}', c.oid,'USAGE') OR has_sequence_privilege('${role}', c.oid,'SELECT') OR has_sequence_privilege('${role}', c.oid,'UPDATE'))`)
    for (const sq of seqs.rows) out.push(`${role} has privileges on sequence ${sq.n}`)
  }
  const pub = await db.query<{ n: string }>(
    `SELECT p.oid::regprocedure::text n FROM pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      WHERE p.pronamespace='public'::regnamespace AND a.grantee=0`)
  for (const f of pub.rows) out.push(`PUBLIC can EXECUTE ${f.n}`)
  const definers = await db.query<{ n: string }>(
    `SELECT p.oid::regprocedure::text n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
       AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) c WHERE c LIKE 'search_path=%')`)
  for (const f of definers.rows) out.push(`SECURITY DEFINER without pinned search_path: ${f.n}`)
  const norls = await db.query<{ n: string }>(`SELECT tablename n FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity`)
  for (const t of norls.rows) out.push(`RLS disabled on public.${t.n}`)
  const all = await db.query<{ n: string }>(`SELECT tablename||'.'||policyname n FROM pg_policies WHERE schemaname='public' AND cmd='ALL'`)
  for (const p of all.rows) out.push(`FOR ALL policy ${p.n}`)
  return out
}
