/**
 * CI gate: applying EVERY migration in supabase/migrations must leave the public schema
 * inside the exposure contract (exposure-gate.ts). A future migration that adds a table,
 * sequence or function reachable by anon/authenticated fails here.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync } from 'fs'
import { join } from 'path'
import { newDb, applyMigrations } from './supabase-emulation'
import { findExposureViolations } from './exposure-gate'

const dir = join(__dirname, '..', '..', '..', 'supabase', 'migrations')
const prefixes = readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => f.slice(0, 3))

describe('exposure gate', () => {
  it('applies all migrations in order with no violations', async () => {
    const db = await newDb()
    await applyMigrations(db, prefixes)
    expect(await findExposureViolations(db)).toEqual([])
    await db.close()
  }, 60_000)

  it('the gate really detects a careless future migration (meta-test)', async () => {
    const db = await newDb()
    await applyMigrations(db, prefixes)
    await db.exec(`
      CREATE TABLE public.future_t (id serial PRIMARY KEY);
      GRANT SELECT ON public.future_t TO anon;
      CREATE FUNCTION public.future_f() RETURNS int LANGUAGE sql SECURITY DEFINER AS 'select 1';
      GRANT EXECUTE ON FUNCTION public.future_f() TO authenticated;
    `)
    const v = await findExposureViolations(db)
    expect(v).toEqual(expect.arrayContaining([
      'anon HAS SELECT on public.future_t',
      expect.stringMatching(/authenticated can EXECUTE future_f/),
      expect.stringMatching(/SECURITY DEFINER without pinned search_path: future_f/),
      'RLS disabled on public.future_t',
    ]))
    await db.close()
  }, 60_000)

  it('a migration that is NOT applied with 012 is flagged for future functions (finding confirmed)', async () => {
    const db = await newDb()
    await applyMigrations(db, prefixes.filter(p => p !== '012'))
    await db.exec(`CREATE FUNCTION public.f_after_011() RETURNS int LANGUAGE sql AS 'select 1'`)
    expect(await findExposureViolations(db)).toEqual(expect.arrayContaining([
      expect.stringMatching(/anon can EXECUTE f_after_011/),
      expect.stringMatching(/PUBLIC can EXECUTE f_after_011/),
    ]))
    await db.close()
  }, 60_000)
})
