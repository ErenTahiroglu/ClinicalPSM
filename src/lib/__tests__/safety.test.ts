import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import {
  CLINICAL_WRITES_ENABLED,
  NEW_PURCHASES_ENABLED,
  withClinicalWriteHold,
} from '../safety'
import { getCheckoutUrl, buildPolarCheckoutUrl } from '../polar'
import { routing } from '@/i18n/routing'

const ROOT = join(__dirname, '..', '..', '..')
const SRC = join(ROOT, 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) {
      if (e === '__tests__' || e === 'node_modules') continue
      walk(p, out)
    } else if (/\.(ts|tsx)$/.test(e)) out.push(p)
  }
  return out
}
const rel = (p: string) => relative(ROOT, p).split('\\').join('/')

describe('safety constants', () => {
  it('default to closed', () => {
    expect(CLINICAL_WRITES_ENABLED).toBe(false)
    expect(NEW_PURCHASES_ENABLED).toBe(false)
  })

  it('are not influenced by environment variables', () => {
    const src = readFileSync(join(SRC, 'lib/safety.ts'), 'utf8')
    expect(src).not.toMatch(/process\.env/)
  })

  it('wrapper never invokes the handler while closed', async () => {
    let called = false
    const wrapped = withClinicalWriteHold(async () => {
      called = true
      return new Response('x')
    })
    const res = await wrapped()
    expect(res.status).toBe(503)
    expect(called).toBe(false)
  })
})

describe('checkout hold', () => {
  it('getCheckoutUrl returns null for every paid plan', () => {
    expect(getCheckoutUrl('plus', { email: 'a@example.edu', userId: 'u1' })).toBeNull()
    expect(getCheckoutUrl('pro')).toBeNull()
  })

  it('buildPolarCheckoutUrl is only reachable through getCheckoutUrl in app code', () => {
    const offenders = walk(SRC)
      .filter(f => !/lib\/polar\.ts$/.test(f))
      .filter(f => readFileSync(f, 'utf8').includes('buildPolarCheckoutUrl'))
      .map(rel)
    expect(offenders).toEqual([])
    expect(buildPolarCheckoutUrl('plus')).toContain('polar.sh') // helper itself unchanged
  })

  it('hosted checkout URLs are not referenced outside lib/polar.ts', () => {
    const offenders = walk(SRC)
      .filter(f => !/lib\/polar\.ts$/.test(f))
      .filter(f => readFileSync(f, 'utf8').includes('POLAR_CHECKOUT_URLS'))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('webhook route does not depend on the purchase hold (existing customers preserved)', () => {
    const src = readFileSync(join(SRC, 'app/api/webhooks/polar/route.ts'), 'utf8')
    expect(src).not.toMatch(/safety/)
    expect(src).toContain('applySubscriptionActive')
    expect(src).toContain('applySubscriptionRevoked')
  })
})

describe('no alternate write path in app code', () => {
  const files = walk(SRC)

  it('only the guarded upload route writes to Supabase Storage', () => {
    const writers = files
      .filter(f => /\.storage\s*\.from\([^)]*\)\s*\.(upload|update|move|copy)\b|\.storage\s*\.from\([^)]*\)\s*\n?\s*\.(upload|update)\b/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(writers).toEqual(['src/app/api/analyses/[id]/upload/route.ts'])
  })

  it('only guarded routes insert into uploads or write result_summary', () => {
    const uploadsInsert = files.filter(f => /from\('uploads'\)\s*\.insert/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(uploadsInsert).toEqual(['src/app/api/analyses/[id]/upload/route.ts'])
    const resultWriters = files.filter(f => !f.includes('/src/types/')).filter(f => /result_summary\s*:/.test(readFileSync(f, 'utf8'))).map(rel)
    expect(resultWriters).toEqual(['src/app/api/analyses/[id]/results/route.ts'])
  })

  it('guarded routes export POST through the hold wrapper', () => {
    for (const p of ['analyses/[id]/upload', 'analyses/[id]/results', 'analyses']) {
      const src = readFileSync(join(SRC, 'app/api', p, 'route.ts'), 'utf8')
      expect(src).toMatch(/export const POST = withClinicalWriteHold\(/)
    }
  })

  it('client components do not use the browser Supabase client for storage or uploads/analyses writes', () => {
    const offenders = files
      .filter(f => readFileSync(f, 'utf8').includes("'use client'"))
      .filter(f => /supabase\/client/.test(readFileSync(f, 'utf8')))
      .filter(f => /\.(storage|insert|update|upsert)\b/.test(readFileSync(f, 'utf8')))
      .map(rel)
    expect(offenders).toEqual([])
  })
})

describe('migration 010 is non-destructive', () => {
  const sql = readFileSync(join(ROOT, 'supabase/migrations/010_cp00_safety_hold.sql'), 'utf8')
  const live = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

  it('contains no data-destroying or data-modifying statements', () => {
    expect(live).not.toMatch(/\bDELETE\s+FROM\b/i)
    expect(live).not.toMatch(/\bTRUNCATE\b/i)
    expect(live).not.toMatch(/\bDROP\s+(TABLE|COLUMN|SCHEMA)\b/i)
    expect(live).not.toMatch(/\bUPDATE\s+\w[\w.]*\s+SET\b/i)
    expect(live).not.toMatch(/\bALTER\s+TABLE\b/i)
  })

  it('creates blocking triggers and storage policies', () => {
    for (const n of [
      'cp00_block_analyses_result_insert',
      'cp00_block_analyses_result_update',
      'cp00_block_uploads_insert',
      'cp00_block_uploads_update',
      'cp00_block_analysis_cache_write',
      'cp00_block_csv_uploads_insert',
      'cp00_block_csv_uploads_update',
    ]) expect(live).toContain(n)
  })

  it('documents rollback', () => {
    expect(sql).toMatch(/ROLLBACK/)
  })
})

describe('TR/EN messaging', () => {
  const load = (l: string) => JSON.parse(readFileSync(join(ROOT, 'messages', `${l}.json`), 'utf8'))
  const keys = (o: unknown, p = ''): string[] =>
    o && typeof o === 'object'
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => keys(v, `${p}.${k}`))
      : [p]
  const en = load('en')
  const tr = load('tr')

  it('locales are still en + tr', () => {
    expect([...routing.locales].sort()).toEqual(['en', 'tr'])
  })

  it('en and tr have identical key sets', () => {
    expect(keys(tr).sort()).toEqual(keys(en).sort())
  })

  it('hold messages exist and are non-empty in both locales', () => {
    for (const m of [en, tr]) {
      expect(m.new.holdTitle).toBeTruthy()
      expect(m.new.holdBody).toBeTruthy()
      expect(m.pricing.holdNotice).toBeTruthy()
      expect(m.pricing.purchasesPaused).toBeTruthy()
    }
    expect(en.new.holdTitle).not.toBe(tr.new.holdTitle)
  })

  it('no unsupported claims remain in user-facing copy', () => {
    const all = JSON.stringify([en, tr]).toLowerCase()
    for (const bad of [
      'publication-ready', 'yayına hazır', 'matchit', 'hipaa', 'kvkk', 'gdpr',
      'no data leaves your browser', 'tarayıcınızdan çıkmaz', 'ready for your paper',
    ]) expect(all).not.toContain(bad)
  })

  it('pricing page never renders the hosted checkout URL while held', () => {
    const src = readFileSync(join(SRC, 'app/[locale]/pricing/page.tsx'), 'utf8')
    expect(src).toContain('NEW_PURCHASES_ENABLED')
    expect(src).not.toContain('buy.polar.sh')
  })
})

describe('matching method honesty', () => {
  it('optimal matching option is disabled and rejected in the settings step', () => {
    const src = readFileSync(join(SRC, 'features/analysis/components/WizardStep3Settings.tsx'), 'utf8')
    expect(src).toMatch(/<option value="optimal" disabled>/)
    expect(src).toMatch(/method !== 'nearest'/)
  })
})
