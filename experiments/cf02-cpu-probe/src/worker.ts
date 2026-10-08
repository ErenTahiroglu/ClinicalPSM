// CF-02 CPU probe. Fixed, bounded, synthetic-only operations to measure Cloudflare Workers CPU time.
// NO arbitrary SQL, NO diagnostic/admin endpoints, NO user data, NO credentials service.
// Every route requires the probe token (a throwaway Worker secret) so the public workers.dev URL cannot be used
// to burn quota. Without the token every path answers 404.
import { hashPassword, verifyPassword } from '@better-auth/utils/password'

interface Env {
  PROBE_TOKEN: string
  DB?: D1Database
}

const FIXED_SYNTHETIC = 'synthetic-value-not-a-credential'
const PBKDF2_LEVELS = new Set([25_000, 50_000, 100_000, 200_000, 600_000])
const enc = new TextEncoder()
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

function ok(req: Request, env: Env): boolean {
  const t = req.headers.get('x-probe-token') ?? ''
  if (!env.PROBE_TOKEN || t.length !== env.PROBE_TOKEN.length) return false
  let d = 0
  for (let i = 0; i < t.length; i++) d |= t.charCodeAt(i) ^ env.PROBE_TOKEN.charCodeAt(i)
  return d === 0
}

async function pbkdf2(iterations: number) {
  const key = await crypto.subtle.importKey('raw', enc.encode(FIXED_SYNTHETIC), 'PBKDF2', false, ['deriveBits'])
  await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode('fixed-synthetic-salt'), iterations }, key, 256)
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (!ok(req, env)) return json({ error: 'not found' }, 404)
    const p = url.pathname

    if (p === '/ping') return json({ ok: true })

    const m = /^\/pbkdf2\/(\d+)$/.exec(p)
    if (m) {
      const n = Number(m[1])
      if (!PBKDF2_LEVELS.has(n)) return json({ error: 'level not allowed' }, 400)
      try {
        await pbkdf2(n)
        return json({ ok: true, op: 'pbkdf2-sha256', iterations: n })
      } catch (e) {
        // fixed synthetic input only: the error text is platform text, not data
        return json({ ok: false, op: 'pbkdf2-sha256', iterations: n, error: e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : 'unknown' }, 200)
      }
    }
    if (p === '/ba-hash') { const h = await hashPassword(FIXED_SYNTHETIC); return json({ ok: true, op: 'better-auth hashPassword', length: h.length }) }
    if (p === '/ba-verify') {
      const h = await hashPassword(FIXED_SYNTHETIC)
      const t0 = Date.now()
      const r = await verifyPassword(h, FIXED_SYNTHETIC)
      return json({ ok: r, op: 'better-auth hashPassword+verifyPassword', t: Date.now() - t0 })
    }

    // D1 (only when a throwaway database is bound). Fixed operations on a fixed synthetic table; no caller SQL.
    if (p.startsWith('/d1/')) {
      if (!env.DB) return json({ error: 'd1 not bound' }, 404)
      if (p === '/d1/read') {
        const id = Number(url.searchParams.get('id') ?? '1') | 0
        const r = await env.DB.prepare('SELECT id, label FROM probe_items WHERE id = ?').bind(id).all()
        return json({ ok: true, rows: r.results.length, meta: { rows_read: r.meta.rows_read, rows_written: r.meta.rows_written } })
      }
      if (p === '/d1/write') {
        const c = await env.DB.prepare('SELECT count(*) AS n FROM probe_items').first<{ n: number }>()
        if ((c?.n ?? 0) >= 200) return json({ error: 'cap reached' }, 429)
        const r = await env.DB.prepare('INSERT INTO probe_items (label) VALUES (?)').bind('synthetic-' + crypto.randomUUID()).run()
        return json({ ok: true, meta: { rows_read: r.meta.rows_read, rows_written: r.meta.rows_written } })
      }
      if (p === '/d1/count') {
        const r = await env.DB.prepare('SELECT count(*) AS n FROM probe_items').all()
        return json({ ok: true, n: (r.results[0] as { n: number }).n, meta: { rows_read: r.meta.rows_read } })
      }
    }
    return json({ error: 'not found' }, 404)
  },
}
