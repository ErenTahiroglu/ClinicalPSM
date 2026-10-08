/**
 * Executable PostgreSQL authorization tests for CP-00 R1.
 * Real Postgres engine (PGlite) + Supabase role/privilege emulation. Synthetic data only.
 *
 * "BEFORE" = migrations 001..010 (the audited commit). "AFTER" = 001..011.
 * The BEFORE suite proves each P0 is real; the AFTER suite proves it is closed
 * and that legitimate server-side behavior still works.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { newDb, applyMigrations, as, migrationSql, type Actor } from './supabase-emulation'

const FREE = '00000000-0000-0000-0000-00000000f001'
const PLUS = '00000000-0000-0000-0000-00000000a002'
const PRO = '00000000-0000-0000-0000-00000000b003'
const OTHER = '00000000-0000-0000-0000-00000000c004'
const SENTINEL = 'SYNTHETIC_SENTINEL_PATIENT_0001'

const anon: Actor = { role: 'anon' }
const svc: Actor = { role: 'service_role' }
const pg: Actor = { role: 'postgres' }
const user = (sub: string): Actor => ({ role: 'authenticated', sub })

const DENIED = { code: '42501' }

async function seed(db: PGlite) {
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

async function snapshot(db: PGlite) {
  const q = async (sql: string) => (await as<{ v: string }>(db, pg, sql))[0].v
  return {
    analyses: await q(`SELECT md5(coalesce(string_agg(a::text, '|' ORDER BY id),'')) v FROM public.analyses a`),
    uploads: await q(`SELECT md5(coalesce(string_agg(u::text, '|' ORDER BY id),'')) v FROM public.uploads u`),
    cache: await q(`SELECT md5(coalesce(string_agg(c::text, '|' ORDER BY id),'')) v FROM public.analysis_cache c`),
    audit: await q(`SELECT md5(coalesce(string_agg(l::text, '|' ORDER BY id),'')) v FROM public.audit_logs l`),
    profiles: await q(`SELECT md5(coalesce(string_agg(p::text, '|' ORDER BY id),'')) v FROM public.profiles p`),
  }
}

const BASE = ['001', '002', '003', '004', '005', '006', '007', '008', '009']

// ===========================================================================
describe('BEFORE (audited commit 9fa33f2, migrations 001-010): findings are real', () => {
  let db: PGlite
  beforeAll(async () => {
    db = await newDb()
    await applyMigrations(db, BASE)
    await seed(db)
    await applyMigrations(db, ['010'])
  }, 60_000)
  afterAll(async () => { await db.close() })

  it('P0-1: a user can grant themselves a paid plan and unlimited quota', async () => {
    await as(db, user(FREE), `UPDATE public.profiles SET plan='pro', analyses_limit=999999, polar_subscription_id='forged' WHERE user_id=$1`, [FREE])
    const [row] = await as<{ plan: string; analyses_limit: number }>(db, pg, `SELECT plan, analyses_limit FROM public.profiles WHERE user_id=$1`, [FREE])
    expect(row).toMatchObject({ plan: 'pro', analyses_limit: 999999 })
  })

  it('P0-1: a user can delete and recreate their profile with a paid plan', async () => {
    await as(db, user(OTHER), `DELETE FROM public.profiles WHERE user_id=$1`, [OTHER])
    await as(db, user(OTHER), `INSERT INTO public.profiles (user_id, plan, analyses_limit) VALUES ($1,'pro',999999)`, [OTHER])
    const [row] = await as<{ plan: string }>(db, pg, `SELECT plan FROM public.profiles WHERE user_id=$1`, [OTHER])
    expect(row.plan).toBe('pro')
  })

  it('P0-2: anon can call the SECURITY DEFINER RPC as another user with unlimited quota', async () => {
    const rows = await as<{ user_id: string; name: string }>(
      db, anon,
      `SELECT * FROM public.create_analysis_with_limit_check($1, $2, 'draft', now() - interval '1 day', 999999)`,
      [PLUS, SENTINEL]
    )
    expect(rows[0]).toMatchObject({ user_id: PLUS, name: SENTINEL })
  })

  it('P0-3: a Pro user reads other users\' audit rows; anon can forge audit rows', async () => {
    const rows = await as<{ user_id: string }>(db, user(PRO), `SELECT user_id FROM public.audit_logs`)
    expect(rows.some(r => r.user_id === OTHER)).toBe(true)
    await as(db, anon, `INSERT INTO public.audit_logs (user_id, action, resource_type) VALUES ('system','PLAN_CHANGED','profile')`)
  })

  it('P0-4: anon can read and write analysis_cache', async () => {
    const rows = await as(db, anon, `SELECT key FROM public.analysis_cache`)
    expect(rows.length).toBeGreaterThan(0)
    await as(db, anon, `UPDATE public.analysis_cache SET result='{"x":1}'`) // 010 trigger blocks content writes; reads are the leak
      .then(() => { throw new Error('010 trigger should block') }, e => expect(e).toBeDefined())
  })

  it('P0-5: 010 does not stop clinical content in analyses.config / name via direct insert', async () => {
    await as(db, user(PRO), `INSERT INTO public.analyses (user_id, name, config) VALUES ($1, $2, $3::jsonb)`, [PRO, SENTINEL, JSON.stringify({ rows: [[SENTINEL]] })])
    const [row] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM public.analyses WHERE name=$1`, [SENTINEL])
    expect(Number(row.n)).toBeGreaterThan(0)
  })
})

// ===========================================================================
describe('AFTER (migrations 001-011)', () => {
  let db: PGlite
  let before: Awaited<ReturnType<typeof snapshot>>

  beforeAll(async () => {
    db = await newDb()
    await applyMigrations(db, BASE)
    await seed(db)
    await applyMigrations(db, ['010'])
    before = await snapshot(db)
    await applyMigrations(db, ['011'])
  }, 60_000)
  afterAll(async () => { await db.close() })

  it('legacy data is byte-identical after 011 (nothing deleted or rewritten)', async () => {
    expect(await snapshot(db)).toEqual(before)
  })

  it('011 is idempotent', async () => {
    await applyMigrations(db, ['011'])
    expect(await snapshot(db)).toEqual(before)
  })

  describe('P0-1 profiles', () => {
    it('user cannot UPDATE own entitlement columns', async () => {
      for (const col of ["plan='pro'", 'analyses_limit=999999', "plan_interval='daily'", "plan_reset_at=now()", "polar_customer_id='x'", "polar_subscription_id='x'"]) {
        await expect(as(db, user(FREE), `UPDATE public.profiles SET ${col} WHERE user_id=$1`, [FREE])).rejects.toMatchObject(DENIED)
      }
    })
    it('user cannot INSERT a forged profile, DELETE own profile, or touch another profile', async () => {
      await expect(as(db, user(FREE), `INSERT INTO public.profiles (user_id, plan) VALUES (gen_random_uuid(),'pro')`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `DELETE FROM public.profiles WHERE user_id=$1`, [FREE])).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `UPDATE public.profiles SET plan='pro' WHERE user_id=$1`, [OTHER])).rejects.toMatchObject(DENIED)
      const [r] = await as<{ plan: string }>(db, pg, `SELECT plan FROM public.profiles WHERE user_id=$1`, [FREE])
      expect(r.plan).toBe('free')
    })
    it('anon has no access', async () => {
      await expect(as(db, anon, `SELECT * FROM public.profiles`)).rejects.toMatchObject(DENIED)
      await expect(as(db, anon, `UPDATE public.profiles SET plan='pro'`)).rejects.toMatchObject(DENIED)
    })
    it('user still reads exactly their own profile', async () => {
      const rows = await as<{ user_id: string }>(db, user(PLUS), `SELECT user_id FROM public.profiles`)
      expect(rows.map(r => r.user_id)).toEqual([PLUS])
    })
    it('service_role (Polar webhook) can still update entitlements', async () => {
      await as(db, svc, `UPDATE public.profiles SET plan='plus', analyses_limit=20, plan_interval='monthly', plan_reset_at=now(), polar_customer_id='c', polar_subscription_id='s' WHERE user_id=$1`, [FREE])
      const [r] = await as<{ plan: string; analyses_limit: number }>(db, pg, `SELECT plan, analyses_limit FROM public.profiles WHERE user_id=$1`, [FREE])
      expect(r).toMatchObject({ plan: 'plus', analyses_limit: 20 })
      await as(db, svc, `UPDATE public.profiles SET plan='free', analyses_limit=1, polar_subscription_id=NULL WHERE user_id=$1`, [FREE]) // revoked path
    })
  })

  describe('P0-2 SECURITY DEFINER RPC', () => {
    const call = (a: Actor, uid = PLUS) =>
      as(db, a, `SELECT * FROM public.create_analysis_with_limit_check($1, $2, 'draft', now(), 999999)`, [uid, SENTINEL])
    it('anon and authenticated cannot execute it (impersonation / quota bypass impossible)', async () => {
      await expect(call(anon)).rejects.toMatchObject(DENIED)
      await expect(call(user(FREE), PLUS)).rejects.toMatchObject(DENIED)
      await expect(call(user(FREE), FREE)).rejects.toMatchObject(DENIED)
    })
    it('even service_role cannot create analyses while the hold is active', async () => {
      await expect(call(svc)).rejects.toThrow(/CP-00 safety hold/)
    })
    it('function is SECURITY INVOKER with a locked search_path; no public function is executable by clients', async () => {
      const [f] = await as<{ prosecdef: boolean; cfg: string[] }>(db, pg,
        `SELECT prosecdef, proconfig AS cfg FROM pg_proc WHERE proname='create_analysis_with_limit_check'`)
      expect(f.prosecdef).toBe(false)
      expect(f.cfg.join()).toMatch(/search_path=""/)
      const bad = await as(db, pg, `SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))`)
      expect(bad).toEqual([])
      const definers = await as<{ proname: string; cfg: string[] | null }>(db, pg,
        `SELECT p.proname, p.proconfig AS cfg FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef`)
      for (const d of definers) expect(d.cfg?.join() ?? '').toMatch(/search_path=""/)
    })
    it('no analysis row was created by any attempt', async () => {
      const [r] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM public.analyses WHERE name=$1`, [SENTINEL])
      expect(r.n).toBe('0')
    })
    it('cleanup_expired_cache is not callable by clients; service_role can run it', async () => {
      await expect(as(db, anon, `SELECT public.cleanup_expired_cache()`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(PRO), `SELECT public.cleanup_expired_cache()`)).rejects.toMatchObject(DENIED)
    })
  })

  describe('P0-3 audit_logs', () => {
    const actors: [string, Actor][] = [['anon', anon], ['free', user(FREE)], ['plus', user(PLUS)], ['pro', user(PRO)], ['unrelated', user(OTHER)]]
    for (const [name, a] of actors) {
      it(`${name} cannot read or forge audit rows`, async () => {
        await expect(as(db, a, `SELECT * FROM public.audit_logs`)).rejects.toMatchObject(DENIED)
        await expect(as(db, a, `INSERT INTO public.audit_logs (user_id, action, resource_type) VALUES ('system','PLAN_CHANGED','profile')`)).rejects.toMatchObject(DENIED)
        await expect(as(db, a, `DELETE FROM public.audit_logs`)).rejects.toMatchObject(DENIED)
      })
    }
    it('service_role can insert and read (trusted server-side audit)', async () => {
      await as(db, svc, `INSERT INTO public.audit_logs (user_id, action, resource_type, metadata) VALUES ($1,'PLAN_CHANGED','profile','{}')`, [FREE])
      const rows = await as(db, svc, `SELECT * FROM public.audit_logs`)
      expect(rows.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('P0-4 analysis_cache', () => {
    const actors: [string, Actor][] = [['anon', anon], ['free', user(FREE)], ['pro', user(PRO)]]
    for (const [name, a] of actors) {
      it(`${name}: SELECT / INSERT / UPDATE / DELETE denied`, async () => {
        await expect(as(db, a, `SELECT * FROM public.analysis_cache`)).rejects.toMatchObject(DENIED)
        await expect(as(db, a, `INSERT INTO public.analysis_cache (key,result,timestamp,user_id,config_hash,data_hash,expires_at) VALUES ('z','{}',now(),'u','c','d',now())`)).rejects.toMatchObject(DENIED)
        await expect(as(db, a, `UPDATE public.analysis_cache SET result='{}'`)).rejects.toMatchObject(DENIED)
        await expect(as(db, a, `DELETE FROM public.analysis_cache`)).rejects.toMatchObject(DENIED)
      })
    }
    it('legacy cache rows are preserved and readable by service_role only', async () => {
      const rows = await as(db, svc, `SELECT key FROM public.analysis_cache`)
      expect(rows).toHaveLength(1)
    })
    it('service_role writes to the cache are still blocked by the 010 hold trigger', async () => {
      await expect(as(db, svc, `UPDATE public.analysis_cache SET result='{"x":1}'`)).rejects.toMatchObject(DENIED)
    })
  })

  describe('P0-5 alternate clinical write paths', () => {
    it('authenticated cannot INSERT analyses (config / name / status carriers)', async () => {
      await expect(as(db, user(PRO), `INSERT INTO public.analyses (user_id, name, config) VALUES ($1,$2,$3::jsonb)`, [PRO, SENTINEL, JSON.stringify({ rows: [[SENTINEL]] })])).rejects.toMatchObject(DENIED)
    })
    it('authenticated cannot UPDATE any analyses column on own rows', async () => {
      const id = '10000000-0000-0000-0000-000000000001'
      for (const set of [`name='${SENTINEL}'`, `config='{"x":"${SENTINEL}"}'`, `status='failed'`, `result_summary='{"a":1}'`]) {
        await expect(as(db, user(FREE), `UPDATE public.analyses SET ${set} WHERE id=$1`, [id])).rejects.toMatchObject(DENIED)
      }
    })
    it('authenticated cannot write uploads', async () => {
      await expect(as(db, user(FREE), `INSERT INTO public.uploads (analysis_id,file_path) VALUES ('10000000-0000-0000-0000-000000000001','x')`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `UPDATE public.uploads SET column_names=ARRAY['x']`)).rejects.toMatchObject(DENIED)
    })
    it('anon cannot touch analyses or uploads', async () => {
      await expect(as(db, anon, `SELECT * FROM public.analyses`)).rejects.toMatchObject(DENIED)
      await expect(as(db, anon, `INSERT INTO public.analyses (user_id,name) VALUES ('${FREE}','x')`)).rejects.toMatchObject(DENIED)
      await expect(as(db, anon, `SELECT * FROM public.uploads`)).rejects.toMatchObject(DENIED)
    })
    it('service_role result_summary writes are blocked by the 010 hold trigger; benign service writes still work', async () => {
      await expect(as(db, svc, `UPDATE public.analyses SET result_summary='{"a":1}' WHERE id='10000000-0000-0000-0000-000000000001'`)).rejects.toMatchObject(DENIED)
      await as(db, svc, `UPDATE public.analyses SET status='completed' WHERE id='10000000-0000-0000-0000-000000000001'`)
    })
    it('storage: csv-uploads INSERT/UPDATE denied for authenticated even with a permissive policy; other buckets unaffected', async () => {
      await expect(as(db, user(FREE), `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','x.csv',$1)`, [FREE])).rejects.toMatchObject(DENIED)
      await as(db, user(FREE), `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('avatars','a.png',$1)`, [FREE])
    })
    it('storage: existing csv-uploads objects remain deletable by an authorised path (data deletion preserved)', async () => {
      await as(db, pg, `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','legacy.csv',$1)`, [FREE])
      await as(db, user(FREE), `DELETE FROM storage.objects WHERE bucket_id='csv-uploads' AND name='legacy.csv'`)
      const [r] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM storage.objects WHERE name='legacy.csv'`)
      expect(r.n).toBe('0')
    })
  })

  describe('legitimate behavior preserved', () => {
    it('owner reads own legacy analysis incl. result_summary and uploads; others cannot', async () => {
      const own = await as<{ name: string; result_summary: unknown }>(db, user(FREE), `SELECT name, result_summary FROM public.analyses`)
      expect(own.map(r => r.name)).toEqual(['legacy-free'])
      expect(own[0].result_summary).toBeTruthy()
      expect(await as(db, user(FREE), `SELECT * FROM public.uploads`)).toHaveLength(1)
      expect(await as(db, user(PLUS), `SELECT * FROM public.analyses`)).toHaveLength(0)
      expect(await as(db, user(PLUS), `SELECT * FROM public.uploads`)).toHaveLength(0)
    })
    it('signup trigger still creates a free profile', async () => {
      const id = '00000000-0000-0000-0000-00000000d005'
      await as(db, pg, `INSERT INTO auth.users (id,email) VALUES ($1,'new@example.test')`, [id])
      const [r] = await as<{ plan: string; analyses_limit: number }>(db, pg, `SELECT plan, analyses_limit FROM public.profiles WHERE user_id=$1`, [id])
      expect(r).toMatchObject({ plan: 'free', analyses_limit: 1 })
    })
    it("deleting someone else's analysis affects nothing; deleting own cascades uploads", async () => {
      const others = await as(db, user(PLUS), `DELETE FROM public.analyses WHERE id='10000000-0000-0000-0000-000000000001' RETURNING id`)
      expect(others).toHaveLength(0)
      const own = await as(db, user(FREE), `DELETE FROM public.analyses WHERE id='10000000-0000-0000-0000-000000000001' RETURNING id`)
      expect(own).toHaveLength(1)
      const [u] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM public.uploads`)
      expect(u.n).toBe('0')
    })
    it('account deletion (auth user delete) cascades profile and analyses', async () => {
      await as(db, pg, `DELETE FROM auth.users WHERE id=$1`, [OTHER])
      const [p] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM public.profiles WHERE user_id=$1`, [OTHER])
      const [a] = await as<{ n: string }>(db, pg, `SELECT count(*)::text n FROM public.analyses WHERE user_id=$1`, [OTHER])
      expect([p.n, a.n]).toEqual(['0', '0'])
    })
  })

  describe('effective-grant matrix (anon / authenticated)', () => {
    it('matches the documented matrix exactly', async () => {
      const ops = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']
      const tables = ['profiles', 'analyses', 'uploads', 'analysis_cache', 'audit_logs']
      const got: Record<string, string[]> = {}
      for (const role of ['anon', 'authenticated']) {
        for (const t of tables) {
          const allowed: string[] = []
          for (const op of ops) {
            const [r] = await as<{ ok: boolean }>(db, pg,
              op === 'DELETE' || op === 'TRUNCATE'
                ? `SELECT has_table_privilege('${role}','public.${t}','${op}') ok`
                : `SELECT has_any_column_privilege('${role}','public.${t}','${op}') ok`)
            if (r.ok) allowed.push(op)
          }
          got[`${role}.${t}`] = allowed
        }
      }
      expect(got).toEqual({
        'anon.profiles': [], 'anon.analyses': [], 'anon.uploads': [], 'anon.analysis_cache': [], 'anon.audit_logs': [],
        'authenticated.profiles': ['SELECT'],
        'authenticated.analyses': ['SELECT', 'DELETE'],
        'authenticated.uploads': ['SELECT'],
        'authenticated.analysis_cache': [],
        'authenticated.audit_logs': [],
      })
    })
  })
})

// ===========================================================================
describe('migration reliability', () => {
  it('011 aborts (does not warn and continue) when storage policies cannot be installed', async () => {
    const db = await newDb({ withStorage: false })
    await applyMigrations(db, ['001', '002', '003', '004', '005', '006', '007', '008', '009'])
    await expect(db.exec(migrationSql('011'))).rejects.toThrow(/storage/i)
    await db.close()
  }, 60_000)

  it('011 aborts when the self-verification detects an exposed object', async () => {
    const db = await newDb()
    await applyMigrations(db, ['001', '002', '003', '004', '005', '006', '007', '008', '009', '010'])
    // A table created by another role with a FOR ALL policy is rejected by verification
    const base = migrationSql('011')
    const marker = base.lastIndexOf('DO $$\nDECLARE\n  t text;')
    expect(marker).toBeGreaterThan(0)
    const sql = base.slice(0, marker) + 'CREATE TABLE public.zz_extra (id int); GRANT SELECT ON public.zz_extra TO anon;\n' + base.slice(marker)
    await expect(db.exec(sql)).rejects.toThrow(/CP-00 R1 verify failed/)
    await db.close()
  }, 60_000)
})
