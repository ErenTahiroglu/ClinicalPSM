// TEST-ONLY entrypoint (wrangler.test.jsonc). Never referenced by wrangler.jsonc (the deployable config).
// Adds: arbitrary SQL, schema dump, outbox, D1 statement tracing. Local use with synthetic data only.
import { createHandler, type Env, type Mailer } from './app'

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS entitlement (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','plus','pro')), polar_subscription_id TEXT, last_event_at INTEGER, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, title TEXT NOT NULL CHECK (length(title) <= 200), created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id)`,
]

interface Trace { sql: string; rows_read: number; rows_written: number }
const trace: Trace[] = []
const stats = { rows_read: 0, rows_written: 0, queries: 0 }
function record(sql: string, meta?: Record<string, number>) {
  if (!meta) return
  trace.push({ sql, rows_read: meta.rows_read ?? 0, rows_written: meta.rows_written ?? 0 })
  stats.rows_read += meta.rows_read ?? 0; stats.rows_written += meta.rows_written ?? 0; stats.queries++
}
function tracingDB(db: D1Database): D1Database {
  const wrap = (st: D1PreparedStatement, sql: string): D1PreparedStatement => new Proxy(st, {
    get(t, prop) {
      const v = (t as never)[prop]
      if (prop === 'bind') return (...a: unknown[]) => wrap(t.bind(...a), sql)
      if (prop === 'all' || prop === 'run') return async () => { const r = (await (v as () => Promise<unknown>).call(t)) as { meta?: Record<string, number> }; record(sql, r.meta); return r }
      if (prop === 'first') return async (c?: string) => { const r = await t.all(); record(sql, r.meta as Record<string, number>); const row = (r.results as Record<string, unknown>[])[0] ?? null; return c ? row?.[c] ?? null : row }
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
    },
  })
  return new Proxy(db, {
    get(t, prop) {
      if (prop === 'prepare') return (q: string) => wrap(t.prepare(q), q)
      if (prop === 'batch') return async (s: D1PreparedStatement[]) => { const r = await t.batch(s); for (const x of r) record('(batch statement)', x.meta as Record<string, number>); return r }
      const v = (t as never)[prop]
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(t) : v
    },
  })
}

const outboxMailer: Mailer = {
  async send(env, kind, to, token) {
    await env.DB.prepare('INSERT INTO outbox (kind, to_email, token, created_at) VALUES (?, ?, ?, ?)').bind(kind, to, token, Date.now()).run()
  },
}

const handle = createHandler({
  mailer: outboxMailer,
  wrapDb: tracingDB,
  async preRoute(req, env, url) {
    if (!url.pathname.startsWith('/__test/')) return null
    const raw = (env.DB as unknown as { __raw?: D1Database }).__raw ?? env.DB
    const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json' } })
    if (url.pathname === '/__test/migrate') {
      const { getMigrations } = await import('better-auth/db/migration')
      const { makeAuth } = await import('./app')
      const { runMigrations } = await getMigrations(makeAuth(env, outboxMailer).options)
      await runMigrations()
      await env.DB.batch([...SCHEMA, `CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, to_email TEXT, token TEXT, created_at INTEGER)`].map(s => env.DB.prepare(s)))
      return j({ ok: true })
    }
    if (url.pathname === '/__test/schema') {
      const r = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name <> 'outbox' ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, name").all<{ sql: string }>()
      return j({ statements: r.results.map(x => x.sql) })
    }
    if (url.pathname === '/__test/stats') {
      if (url.searchParams.get('reset')) { stats.rows_read = stats.rows_written = stats.queries = 0; trace.length = 0 }
      return j({ ...stats, trace: url.searchParams.get('trace') ? trace : undefined })
    }
    if (url.pathname === '/__test/explain' && req.method === 'POST') {
      const { sql } = (await req.json()) as { sql: string }
      const r = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`).all()
      return j({ plan: r.results })
    }
    if (url.pathname === '/__test/sql' && req.method === 'POST') {
      const { sql, params = [] } = (await req.json()) as { sql: string; params?: unknown[] }
      const r = await raw.prepare(sql).bind(...params).all()
      return j({ rows: r.results })
    }
    if (url.pathname === '/__test/batch-atomicity') {
      try {
        await env.DB.batch([
          env.DB.prepare("INSERT INTO webhook_events (event_id, received_at) VALUES ('atomic-test', 1)"),
          env.DB.prepare("INSERT INTO entitlement (user_id, plan, updated_at) VALUES ('nonexistent', 'invalid-plan', 1)"),
        ])
        return j({ threw: false })
      } catch {
        const r = await env.DB.prepare("SELECT count(*) AS n FROM webhook_events WHERE event_id = 'atomic-test'").first<{ n: number }>()
        return j({ threw: true, leftover: r?.n })
      }
    }
    return j({ error: 'not found' }, 404)
  },
})
export default { fetch: (req: Request, env: Env) => handle(req, env) }
