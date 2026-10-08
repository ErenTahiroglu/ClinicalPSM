// Disposable proof of concept: static-first architecture backend.
// Workers + D1 + Better Auth. Synthetic data only. NOT production code.
import { betterAuth } from 'better-auth'
import { getMigrations } from 'better-auth/db/migration'

interface Env {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  WEBHOOK_SECRET: string
  ALLOW_TEST_ENDPOINTS?: string
  PASSWORD_MODE?: string // 'default' (library scrypt) | 'client-derived' (cheap server verifier)
}

// Test-only instrumentation: accumulate D1 row metrics so the free-tier budget uses measured per-flow costs.
const stats = { rows_read: 0, rows_written: 0, queries: 0 }
function addMeta(r: unknown) {
  const metas = Array.isArray(r) ? r.map(x => (x as { meta?: Record<string, number> }).meta) : [(r as { meta?: Record<string, number> })?.meta]
  for (const m of metas) if (m) { stats.rows_read += m.rows_read ?? 0; stats.rows_written += m.rows_written ?? 0; stats.queries++ }
}
function countingDB(db: D1Database): D1Database {
  const wrapStmt = (st: D1PreparedStatement): D1PreparedStatement => new Proxy(st, {
    get(t, prop) {
      const v = (t as never)[prop]
      if (prop === 'bind') return (...a: unknown[]) => wrapStmt(t.bind(...a))
      if (prop === 'all' || prop === 'run') return async () => { const r = await (v as () => Promise<unknown>).call(t); addMeta(r); return r }
      if (prop === 'first') return async (c?: string) => { const r = await t.all(); addMeta(r); const row = (r.results as Record<string, unknown>[])[0] ?? null; return c ? row?.[c] ?? null : row }
      return typeof v === 'function' ? (v as Function).bind(t) : v
    },
  })
  return new Proxy(db, {
    get(t, prop) {
      if (prop === 'prepare') return (q: string) => wrapStmt(t.prepare(q))
      if (prop === 'batch') return async (stmts: D1PreparedStatement[]) => { const r = await t.batch(stmts); addMeta(r); return r }
      const v = (t as never)[prop]
      return typeof v === 'function' ? (v as Function).bind(t) : v
    },
  })
}

const enc = new TextEncoder()
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function hmac(key: string, msg: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(msg))
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

/**
 * 'client-derived' mode: the browser sends KDF(password) (e.g. PBKDF2 600k iterations, salt derived from the email),
 * a 256-bit value. The server stores salted HMAC(pepper, value): a cheap operation that fits the Free CPU budget.
 * Offline attack cost after a DB leak still includes the client-side KDF per guess.
 */
function passwordConfig(env: Env) {
  if (env.PASSWORD_MODE !== 'client-derived') return undefined
  return {
    hash: async (password: string) => {
      const salt = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
      return `cd1$${salt}$${hex(await hmac(env.BETTER_AUTH_SECRET, `${salt}:${password}`))}`
    },
    verify: async ({ hash, password }: { hash: string; password: string }) => {
      const [v, salt, digest] = hash.split('$')
      if (v !== 'cd1' || !salt || !digest) return false
      return safeEqual(digest, hex(await hmac(env.BETTER_AUTH_SECRET, `${salt}:${password}`)))
    },
  }
}

async function outbox(env: Env, kind: string, to: string, token: string) {
  // Production would call a third-party email API here (Workers Email Sending needs a paid plan).
  await env.DB.prepare('INSERT INTO outbox (kind, to_email, token, created_at) VALUES (?, ?, ?, ?)')
    .bind(kind, to, token, Date.now()).run()
}

function makeAuth(env: Env) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      ...(passwordConfig(env) ? { password: passwordConfig(env) } : {}),
      sendResetPassword: async ({ user, token }) => { await outbox(env, 'reset', user.email, token) },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, token }) => { await outbox(env, 'verify', user.email, token) },
    },
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
    rateLimit: { enabled: true, window: 60, max: 100, storage: 'database', customRules: { '/sign-in/email': { window: 60, max: 5 } } },
    trustedOrigins: [env.BETTER_AUTH_URL],
  })
}

const APP_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS entitlement (user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE, plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','plus','pro')), polar_subscription_id TEXT, last_event_at INTEGER, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, received_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, title TEXT NOT NULL CHECK (length(title) <= 200), created_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, to_email TEXT, token TEXT, created_at INTEGER)`,
]

async function sessionUser(auth: ReturnType<typeof makeAuth>, req: Request) {
  const s = await auth.api.getSession({ headers: req.headers })
  return s?.user ?? null
}

async function handleWebhook(req: Request, env: Env): Promise<Response> {
  const body = await req.text()
  const id = req.headers.get('webhook-id') ?? ''
  const ts = req.headers.get('webhook-timestamp') ?? ''
  const sig = req.headers.get('webhook-signature') ?? ''
  const tsn = parseInt(ts, 10)
  if (!id || !sig || Number.isNaN(tsn) || Math.abs(Date.now() / 1000 - tsn) > 300) return json({ error: 'invalid' }, 422)
  const expected = 'v1,' + btoa(String.fromCharCode(...new Uint8Array(await hmac(env.WEBHOOK_SECRET, `${id}.${ts}.${body}`))))
  if (!sig.split(' ').some(s => safeEqual(s, expected))) return json({ error: 'invalid' }, 422)

  let ev: { type?: string; created_at?: number; data?: { user_id?: string; plan?: string; subscription_id?: string } }
  try { ev = JSON.parse(body) } catch { return json({ error: 'invalid' }, 422) }
  const d = ev.data ?? {}
  const plan = ev.type === 'subscription.revoked' ? 'free' : d.plan
  if (!d.user_id || !['free', 'plus', 'pro'].includes(plan ?? '') || typeof ev.created_at !== 'number') return json({ error: 'invalid' }, 422)

  // Atomic: D1 batch() is a transaction. Duplicate event id => the INSERT violates the PK and the whole batch rolls back.
  // Ordering: an older event (created_at <= last_event_at) updates nothing.
  try {
    const [, upd] = await env.DB.batch([
      env.DB.prepare('INSERT INTO webhook_events (event_id, received_at) VALUES (?, ?)').bind(id, Date.now()),
      env.DB.prepare(
        `UPDATE entitlement SET plan = ?, polar_subscription_id = ?, last_event_at = ?, updated_at = ?
         WHERE user_id = ? AND (last_event_at IS NULL OR last_event_at < ?)`
      ).bind(plan, plan === 'free' ? null : d.subscription_id ?? null, ev.created_at, Date.now(), d.user_id, ev.created_at),
    ])
    return json({ ok: true, applied: upd.meta.changes === 1 })
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    if (/UNIQUE|constraint/i.test(m)) return json({ ok: true, duplicate: true }) // replay: acknowledge, change nothing
    return json({ error: 'retry' }, 500) // transient: provider retries
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (env.ALLOW_TEST_ENDPOINTS === '1' && !url.pathname.startsWith('/__test/')) env = { ...env, DB: countingDB(env.DB) }
    const auth = makeAuth(env)

    if (url.pathname.startsWith('/__test/') && env.ALLOW_TEST_ENDPOINTS === '1') {
      if (url.pathname === '/__test/migrate') {
        const { runMigrations } = await getMigrations(auth.options)
        await runMigrations()
        await env.DB.batch(APP_SCHEMA.map(s => env.DB.prepare(s)))
        return json({ ok: true })
      }
      if (url.pathname === '/__test/stats') { if (url.searchParams.get('reset')) { stats.rows_read = stats.rows_written = stats.queries = 0 } return json({ ...stats }) }
      if (url.pathname === '/__test/sql' && req.method === 'POST') {
        const { sql, params = [] } = (await req.json()) as { sql: string; params?: unknown[] }
        const r = await env.DB.prepare(sql).bind(...params).all()
        return json({ rows: r.results })
      }
      if (url.pathname === '/__test/batch-atomicity') {
        try {
          await env.DB.batch([
            env.DB.prepare("INSERT INTO webhook_events (event_id, received_at) VALUES ('atomic-test', 1)"),
            env.DB.prepare("INSERT INTO entitlement (user_id, plan, updated_at) VALUES ('nonexistent', 'invalid-plan', 1)"),
          ])
          return json({ threw: false })
        } catch {
          const r = await env.DB.prepare("SELECT count(*) AS n FROM webhook_events WHERE event_id = 'atomic-test'").first<{ n: number }>()
          return json({ threw: true, leftover: r?.n })
        }
      }
      return json({ error: 'not found' }, 404)
    }

    if (url.pathname.startsWith('/api/auth/')) {
      const res = await auth.handler(req)
      // New users get a server-created free entitlement row (never client-provided).
      if (url.pathname === '/api/auth/sign-up/email' && res.status === 200) {
        const b = (await res.clone().json()) as { user?: { id?: string } }
        if (b.user?.id) {
          await env.DB.prepare('INSERT OR IGNORE INTO entitlement (user_id, plan, updated_at) VALUES (?, \'free\', ?)').bind(b.user.id, Date.now()).run()
        }
      }
      return res
    }

    if (url.pathname === '/api/webhooks/payments' && req.method === 'POST') return handleWebhook(req, env)

    const user = await sessionUser(auth, req)
    if (!user) return json({ error: 'unauthorized' }, 401)

    if (url.pathname === '/api/me' && req.method === 'GET') {
      const e = await env.DB.prepare('SELECT plan FROM entitlement WHERE user_id = ?').bind(user.id).first<{ plan: string }>()
      return json({ id: user.id, email: user.email, plan: e?.plan ?? 'free' })
    }
    // The client can never write entitlements: there is no such route; any attempt is a 404/405.
    if (url.pathname === '/api/items' && req.method === 'POST') {
      const { title } = (await req.json()) as { title?: string }
      if (!title || title.length > 200) return json({ error: 'invalid' }, 422)
      const id = crypto.randomUUID()
      await env.DB.prepare('INSERT INTO items (id, user_id, title, created_at) VALUES (?, ?, ?, ?)').bind(id, user.id, title, Date.now()).run()
      return json({ id }, 201)
    }
    if (url.pathname === '/api/items' && req.method === 'GET') {
      const r = await env.DB.prepare('SELECT id, title FROM items WHERE user_id = ?').bind(user.id).all()
      return json({ items: r.results })
    }
    const m = /^\/api\/items\/([0-9a-f-]{36})$/.exec(url.pathname)
    if (m) {
      const row = await env.DB.prepare('SELECT id, title FROM items WHERE id = ? AND user_id = ?').bind(m[1], user.id).first()
      if (!row) return json({ error: 'not found' }, 404) // same answer for "absent" and "someone else's"
      if (req.method === 'GET') return json(row)
      if (req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(m[1], user.id).run()
        return json({ ok: true })
      }
    }
    return json({ error: 'not found' }, 404)
  },
}
