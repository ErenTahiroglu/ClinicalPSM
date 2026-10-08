/**
 * CP-00 R2 executable tests: future-object privileges, Storage policy verification
 * with mutation tests, migration 012 behavior. PGlite (real Postgres) + Supabase emulation.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { newDb, applyMigrations, as, migrationSql } from './supabase-emulation'
import { FREE, PLUS, SENTINEL, anon, svc, pg, user, DENIED, seed, snapshot } from './fixtures'
import { findExposureViolations } from './exposure-gate'

const BASE = ['001', '002', '003', '004', '005', '006', '007', '008', '009']
const verifyBlock = (() => {
  const s = migrationSql('012')
  const m = /-- BEGIN VERIFY\n([\s\S]*?)\n-- END VERIFY/.exec(s)
  if (!m) throw new Error('verify block markers missing')
  return m[1]
})()
const runVerify = async (db: PGlite): Promise<void> => { await db.exec(verifyBlock) }

async function build(upTo: string[]): Promise<PGlite> {
  const db = await newDb()
  await applyMigrations(db, BASE)
  await seed(db)
  await applyMigrations(db, upTo)
  return db
}

describe('migration 012 on top of 001-011', () => {
  let db: PGlite
  let before: Awaited<ReturnType<typeof snapshot>>

  beforeAll(async () => {
    db = await newDb()
    await applyMigrations(db, BASE)
    await seed(db)
    await applyMigrations(db, ['010', '011'])
    before = await snapshot(db)
    // create a function BEFORE 012 to prove the R1 gap, then apply 012
    await db.exec(`CREATE FUNCTION public.gap_probe() RETURNS int LANGUAGE sql AS 'select 1'`)
    const r = await as<{ a: boolean; u: boolean }>(db, pg,
      `SELECT has_function_privilege('anon','public.gap_probe()','EXECUTE') a, has_function_privilege('authenticated','public.gap_probe()','EXECUTE') u`)
    expect(r[0]).toEqual({ a: true, u: true }) // R1 finding confirmed: future function exposed after 011
    await db.exec(`DROP FUNCTION public.gap_probe()`)
    await applyMigrations(db, ['012'])
  }, 60_000)
  afterAll(async () => { await db.close() })

  it('does not touch legacy data', async () => {
    expect(await snapshot(db)).toEqual(before)
  })

  it('is idempotent', async () => {
    await applyMigrations(db, ['012'])
    expect(await snapshot(db)).toEqual(before)
  })

  it('verification block passes on the migrated database', async () => {
    await expect(runVerify(db)).resolves.toBeUndefined()
  })

  it('leaves no probe objects behind', async () => {
    const rows = await as(db, pg, `SELECT relname FROM pg_class WHERE relname LIKE 'cp00_probe%' UNION SELECT proname FROM pg_proc WHERE proname LIKE 'cp00_probe%'`)
    expect(rows).toEqual([])
  })

  describe('FUTURE functions (created after 012 by the migration owner)', () => {
    beforeAll(async () => {
      await db.exec(`
        CREATE FUNCTION public.future_invoker() RETURNS int LANGUAGE sql AS 'select 1';
        CREATE FUNCTION public.future_unsafe_definer() RETURNS bigint LANGUAGE sql SECURITY DEFINER AS 'select count(*) from public.analyses';
        CREATE FUNCTION public.future_unsafe_writer(p uuid) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ update public.profiles set plan='pro' where user_id=p $$;
      `)
    })
    it('effective EXECUTE: anon/authenticated denied; owner allowed', async () => {
      for (const fn of ['future_invoker()', 'future_unsafe_definer()', 'future_unsafe_writer(uuid)']) {
        const [r] = await as<{ a: boolean; u: boolean; o: boolean; p: boolean }>(db, pg, `SELECT
          has_function_privilege('anon','public.${fn}','EXECUTE') a,
          has_function_privilege('authenticated','public.${fn}','EXECUTE') u,
          has_function_privilege(current_user,'public.${fn}','EXECUTE') o,
          EXISTS (SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='public.${fn}'::regprocedure), acldefault('f', current_user::regrole))) x WHERE x.grantee=0) p`)
        expect(r).toEqual({ a: false, u: false, o: true, p: false })
      }
    })
    it('anon and authenticated cannot call the intentionally unsafe SECURITY DEFINER functions', async () => {
      await expect(as(db, anon, `SELECT public.future_unsafe_definer()`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `SELECT public.future_unsafe_definer()`)).rejects.toMatchObject(DENIED)
      await expect(as(db, anon, `SELECT public.future_unsafe_writer('${FREE}')`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `SELECT public.future_unsafe_writer('${FREE}')`)).rejects.toMatchObject(DENIED)
      const [p] = await as<{ plan: string }>(db, pg, `SELECT plan FROM public.profiles WHERE user_id=$1`, [FREE])
      expect(p.plan).toBe('free')
    })
    it('trusted owner can still call; explicit GRANT to service_role works', async () => {
      expect((await as<{ c: string }>(db, pg, `SELECT public.future_unsafe_definer()::text c`))[0].c).toBeDefined()
      await db.exec(`GRANT EXECUTE ON FUNCTION public.future_invoker() TO service_role`)
      await expect(as(db, svc, `SELECT public.future_invoker()`)).resolves.toBeDefined()
    })
  })

  describe('FUTURE tables and sequences', () => {
    beforeAll(async () => {
      await db.exec(`CREATE TABLE public.future_t (id serial PRIMARY KEY, note text); ALTER TABLE public.future_t ENABLE ROW LEVEL SECURITY;
                     INSERT INTO public.future_t (note) VALUES ('${SENTINEL}');`)
    })
    it('no table, column or sequence privileges for anon / authenticated / PUBLIC', async () => {
      for (const role of ['anon', 'authenticated']) {
        for (const op of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          const [r] = await as<{ ok: boolean; c: boolean }>(db, pg, `SELECT has_table_privilege('${role}','public.future_t','${op}') ok,
            has_any_column_privilege('${role}','public.future_t','${['SELECT','INSERT','UPDATE','REFERENCES'].includes(op) ? op : 'SELECT'}') c`)
          expect(r.ok, `${role} ${op}`).toBe(false)
          if (['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'].includes(op)) expect(r.c, `${role} col ${op}`).toBe(false)
        }
        const [s] = await as<{ u: boolean; s: boolean; w: boolean }>(db, pg, `SELECT has_sequence_privilege('${role}','public.future_t_id_seq','USAGE') u,
          has_sequence_privilege('${role}','public.future_t_id_seq','SELECT') s, has_sequence_privilege('${role}','public.future_t_id_seq','UPDATE') w`)
        expect(s).toEqual({ u: false, s: false, w: false })
      }
      const pub = await as(db, pg, `SELECT 1 FROM pg_class c, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a WHERE c.oid='public.future_t'::regclass AND a.grantee=0`)
      expect(pub).toEqual([])
    })
    it('direct access is denied for clients (no RLS reliance)', async () => {
      await expect(as(db, anon, `SELECT * FROM public.future_t`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `SELECT * FROM public.future_t`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `INSERT INTO public.future_t (note) VALUES ('x')`)).rejects.toMatchObject(DENIED)
      await expect(as(db, user(FREE), `SELECT nextval('public.future_t_id_seq')`)).rejects.toMatchObject(DENIED)
    })
    it('trusted service-role operations still work on a future table once explicitly granted', async () => {
      await db.exec(`GRANT ALL ON public.future_t, public.future_t_id_seq TO service_role`)
      await as(db, svc, `INSERT INTO public.future_t (note) VALUES ('svc')`)
      expect((await as(db, svc, `SELECT * FROM public.future_t`)).length).toBe(2)
    })
  })

  describe('existing privileged behavior has not regressed', () => {
    it('exposure gate is clean', async () => {
      expect(await findExposureViolations(db)).toEqual(expect.not.arrayContaining([expect.stringMatching(/^(anon|authenticated|PUBLIC)/)]))
    })
    it('signup trigger, webhook update, cleanup function, owner read/delete still work', async () => {
      await as(db, pg, `INSERT INTO auth.users (id,email) VALUES ('00000000-0000-0000-0000-00000000e009','x@example.test')`)
      expect((await as(db, pg, `SELECT 1 FROM public.profiles WHERE user_id='00000000-0000-0000-0000-00000000e009'`)).length).toBe(1)
      await as(db, svc, `UPDATE public.profiles SET plan='plus', analyses_limit=20 WHERE user_id=$1`, [PLUS])
      await expect(as(db, svc, `SELECT public.cleanup_expired_cache()`)).resolves.toBeDefined()
      expect((await as(db, user(FREE), `SELECT * FROM public.analyses`)).length).toBe(1)
      expect((await as(db, user(FREE), `DELETE FROM public.analyses WHERE id='10000000-0000-0000-0000-000000000001' RETURNING id`)).length).toBe(1)
    })
    it('RPC still blocked for every role', async () => {
      for (const a of [anon, user(FREE)]) {
        await expect(as(db, a, `SELECT * FROM public.create_analysis_with_limit_check('${FREE}','x','draft',now(),9)`)).rejects.toMatchObject(DENIED)
      }
      await expect(as(db, svc, `SELECT * FROM public.create_analysis_with_limit_check('${FREE}','x','draft',now(),9)`)).rejects.toThrow(/CP-00 safety hold/)
    })
  })

  describe('default-privilege mutation tests (verification must detect)', () => {
    const cases: [string, string][] = [
      ['global table default granted to anon', `ALTER DEFAULT PRIVILEGES GRANT SELECT ON TABLES TO anon`],
      ['schema sequence default granted to authenticated', `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO authenticated`],
      ['global function default re-granted to PUBLIC', `ALTER DEFAULT PRIVILEGES GRANT EXECUTE ON FUNCTIONS TO PUBLIC`],
      ['schema function default granted to anon', `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon`],
    ]
    for (const [name, sql] of cases) {
      it(name, async () => {
        const d = await build(['010', '011', '012'])
        await d.exec(sql)
        await expect(runVerify(d)).rejects.toThrow(/CP-00 R2 verify failed/)
        await d.close()
      }, 60_000)
    }
    it('an object owned by a different role is flagged', async () => {
      const d = await build(['010', '011', '012'])
      await d.exec(`CREATE ROLE dev NOLOGIN; CREATE TABLE public.dev_t (id int); ALTER TABLE public.dev_t OWNER TO dev; ALTER TABLE public.dev_t ENABLE ROW LEVEL SECURITY;`)
      await expect(runVerify(d)).rejects.toThrow(/not owned by migration role/)
      await d.close()
    }, 60_000)
    it('012 revokes client-granting defaults of another creator role', async () => {
      const d = await newDb()
      await d.exec(`CREATE ROLE other_creator NOLOGIN;
        ALTER DEFAULT PRIVILEGES FOR ROLE other_creator IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
        ALTER DEFAULT PRIVILEGES FOR ROLE other_creator GRANT EXECUTE ON FUNCTIONS TO anon;`)
      await applyMigrations(d, [...BASE, '010', '011', '012'])
      const rows = (await d.query<{ n: string }>(`SELECT count(*)::text n FROM pg_default_acl d, aclexplode(d.defaclacl) a
        WHERE d.defaclrole='other_creator'::regrole AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)`)).rows
      expect(rows[0].n).toBe('0')
      await d.close()
    }, 60_000)
  })
})

describe('Storage policy deep verification (mutation tests)', () => {
  const drop = `DROP POLICY IF EXISTS cp00_block_csv_uploads_insert ON storage.objects; DROP POLICY IF EXISTS cp00_block_csv_uploads_update ON storage.objects;`
  const good = {
    ins: `CREATE POLICY cp00_block_csv_uploads_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK (bucket_id <> 'csv-uploads');`,
    upd: `CREATE POLICY cp00_block_csv_uploads_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING (bucket_id <> 'csv-uploads') WITH CHECK (bucket_id <> 'csv-uploads');`,
  }
  const mutants: [string, string][] = [
    ['INSERT policy permissive instead of restrictive', good.ins.replace('AS RESTRICTIVE', 'AS PERMISSIVE') + good.upd],
    ['UPDATE policy permissive instead of restrictive', good.ins + good.upd.replace('AS RESTRICTIVE', 'AS PERMISSIVE')],
    ['INSERT expression allows everything (OR true)', good.ins.replace(`bucket_id <> 'csv-uploads'`, `bucket_id <> 'csv-uploads' OR true`) + good.upd],
    ['INSERT expression guards the wrong bucket', good.ins.replace('csv-uploads', 'other') + good.upd],
    ['INSERT expression inverted (= csv-uploads)', good.ins.replace('<>', '=') + good.upd],
    ['UPDATE missing WITH CHECK', good.ins + `CREATE POLICY cp00_block_csv_uploads_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public USING (bucket_id <> 'csv-uploads');`],
    ['UPDATE missing USING', good.ins + `CREATE POLICY cp00_block_csv_uploads_update ON storage.objects AS RESTRICTIVE FOR UPDATE TO public WITH CHECK (bucket_id <> 'csv-uploads');`],
    ['INSERT targeted only at authenticated', good.ins.replace('TO public', 'TO authenticated') + good.upd],
    ['UPDATE targeted only at anon', good.ins + good.upd.replace('TO public', 'TO anon')],
    ['INSERT policy created FOR ALL', good.ins.replace('FOR INSERT', 'FOR ALL') + good.upd],
    ['INSERT policy created FOR UPDATE', good.ins.replace('FOR INSERT TO public WITH CHECK', 'FOR UPDATE TO public USING') + good.upd],
    ['INSERT policy missing', good.upd],
    ['UPDATE policy missing', good.ins],
    ['both policies missing', ''],
    ['INSERT has an extra USING-less qual-less variant (WITH CHECK true)', good.ins.replace(`bucket_id <> 'csv-uploads'`, 'true') + good.upd],
    ['RLS disabled on storage.objects', good.ins + good.upd + `ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;`],
  ]
  for (const [name, sql] of mutants) {
    it(`detects: ${name}`, async () => {
      const d = await build(['010', '011', '012'])
      await expect(runVerify(d)).resolves.toBeUndefined() // control: good state passes
      await d.exec(drop + sql)
      await expect(runVerify(d)).rejects.toThrow(/CP-00 R2 verify failed: (storage|RLS disabled on storage)/)
      await d.close()
    }, 60_000)
  }

  it('semantically equivalent formatting of the correct policy still passes', async () => {
    const d = await build(['010', '011', '012'])
    await d.exec(drop + `CREATE POLICY cp00_block_csv_uploads_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO public WITH CHECK ((bucket_id)::text <> 'csv-uploads'::text);` + good.upd)
    await expect(runVerify(d)).resolves.toBeUndefined()
    await d.close()
  }, 60_000)

  describe('behavior under the emulated role model (permissive "FOR ALL" bucket policy present)', () => {
    let d: PGlite
    beforeAll(async () => { d = await build(['010', '011', '012']) }, 60_000)
    afterAll(async () => { await d.close() })

    it('csv-uploads INSERT and UPDATE denied; other buckets unaffected; reads and deletes preserved', async () => {
      await expect(as(d, user(FREE), `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','n.csv',$1)`, [FREE])).rejects.toMatchObject(DENIED)
      await as(d, user(FREE), `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('avatars','a.png',$1)`, [FREE])
      await as(d, pg, `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','legacy.csv',$1)`, [FREE])
      // restrictive USING hides csv-uploads rows from UPDATE: zero rows affected, no change
      expect(await as(d, user(FREE), `UPDATE storage.objects SET name='moved.csv' WHERE name='legacy.csv' RETURNING id`)).toEqual([])
      expect((await as(d, pg, `SELECT 1 FROM storage.objects WHERE name='legacy.csv' AND bucket_id='csv-uploads'`)).length).toBe(1)
      await expect(as(d, user(FREE), `UPDATE storage.objects SET bucket_id='csv-uploads' WHERE name='a.png'`)).rejects.toMatchObject(DENIED) // cannot move into the bucket
      await as(d, user(FREE), `UPDATE storage.objects SET name='b.png' WHERE name='a.png'`) // other bucket still updatable
      expect((await as(d, user(FREE), `SELECT * FROM storage.objects WHERE bucket_id='csv-uploads'`)).length).toBe(1)
      await as(d, user(FREE), `DELETE FROM storage.objects WHERE name='legacy.csv'`)
    })

    it('KNOWN LIMITATION: service_role bypasses RLS, so these policies do not restrict service-role writes', async () => {
      await as(d, svc, `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','svc.csv',NULL)`)
      expect((await as(d, pg, `SELECT 1 FROM storage.objects WHERE name='svc.csv'`)).length).toBe(1)
      // No application code path uses the service-role key for Storage (static test in safety.test.ts).
    })

    it('an unsafe PERMISSIVE variant is really exploitable, proving the mutation test is meaningful', async () => {
      const u = await build(['010', '011', '012'])
      await u.exec(drop + good.ins.replace('AS RESTRICTIVE', 'AS PERMISSIVE') + good.upd.replace('AS RESTRICTIVE', 'AS PERMISSIVE'))
      await as(u, user(FREE), `INSERT INTO storage.objects (bucket_id,name,owner) VALUES ('csv-uploads','exploit.csv',$1)`, [FREE])
      await u.close()
    }, 60_000)
  })

  it('012 aborts when storage policies cannot be installed (no storage schema)', async () => {
    const d = await newDb({ withStorage: false })
    await applyMigrations(d, BASE)
    await expect(d.exec(migrationSql('012'))).rejects.toThrow(/storage/i)
    await d.close()
  }, 60_000)
})
