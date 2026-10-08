/** Shared synthetic fixtures for the DB authorization suites. */
import type { PGlite } from '@electric-sql/pglite'
import { as, type Actor } from './supabase-emulation'

export const FREE = '00000000-0000-0000-0000-00000000f001'
export const PLUS = '00000000-0000-0000-0000-00000000a002'
export const PRO = '00000000-0000-0000-0000-00000000b003'
export const OTHER = '00000000-0000-0000-0000-00000000c004'
export const SENTINEL = 'SYNTHETIC_SENTINEL_PATIENT_0001'

export const anon: Actor = { role: 'anon' }
export const svc: Actor = { role: 'service_role' }
export const pg: Actor = { role: 'postgres' }
export const user = (sub: string): Actor => ({ role: 'authenticated', sub })

export const DENIED = { code: '42501' }

export async function seed(db: PGlite) {
  for (const [id, plan] of [[FREE, 'free'], [PLUS, 'plus'], [PRO, 'pro'], [OTHER, 'free']]) {
    await db.query(`INSERT INTO auth.users (id, email) VALUES ($1, $2)`, [id, `${id}@example.test`])
    await db.query(`UPDATE public.profiles SET plan = $2 WHERE user_id = $1`, [id, plan])
  }
  // legacy analyses with row-level results, uploads, cache and audit rows (inserted before 010)
  await db.query(
    `INSERT INTO public.analyses (id, user_id, name, status, result_summary, config)
     VALUES ('10000000-0000-0000-0000-000000000001', $1, 'legacy-free', 'completed', '{"propensityScores":[0.1,0.2]}', '{"covariates":["c1"]}'),
            ('10000000-0000-0000-0000-000000000002', $2, 'legacy-other', 'completed', '{"propensityScores":[0.3]}', '{}')`,
    [FREE, OTHER]
  )
  await db.query(
    `INSERT INTO public.uploads (analysis_id, file_path, row_count, column_names)
     VALUES ('10000000-0000-0000-0000-000000000001', 'csvs/f/1/synthetic.csv', 2, ARRAY['c1'])`
  )
  await db.query(
    `INSERT INTO public.analysis_cache (key, result, timestamp, user_id, config_hash, data_hash, expires_at)
     VALUES ('k1', '{"legacy":true}', now(), $1, 'ch', 'dh', now() - interval '1 day')`,
    [FREE]
  )
  await db.query(
    `INSERT INTO public.audit_logs (user_id, action, resource_type, metadata)
     VALUES ($1, 'FILE_UPLOADED', 'upload', '{"fileName":"synthetic.csv"}'),
            ($2, 'LOGIN', 'user', '{}')`,
    [OTHER, PRO]
  )
}

export async function snapshot(db: PGlite) {
  const q = async (sql: string) => (await as<{ v: string }>(db, pg, sql))[0].v
  return {
    analyses: await q(`SELECT md5(coalesce(string_agg(a::text, '|' ORDER BY id),'')) v FROM public.analyses a`),
    uploads: await q(`SELECT md5(coalesce(string_agg(u::text, '|' ORDER BY id),'')) v FROM public.uploads u`),
    cache: await q(`SELECT md5(coalesce(string_agg(c::text, '|' ORDER BY id),'')) v FROM public.analysis_cache c`),
    audit: await q(`SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY id),'')) v FROM public.audit_logs l`),
    profiles: await q(`SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY id),'')) v FROM public.profiles p`),
  }
}

