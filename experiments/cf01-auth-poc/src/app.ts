// CF-01 auth/entitlement proof of concept: CORE. Contains NO diagnostics and NO test hooks.
// Workers + D1 + Better Auth (default, maintained password handling). Synthetic data only. Payments disabled.
import { betterAuth } from 'better-auth'

export interface Env {
  DB: D1Database
  BETTER_AUTH_URL: string
  BETTER_AUTH_SECRET: string
  WEBHOOK_SECRET: string
}

export interface Mailer {
  send(env: Env, kind: 'verify' | 'reset', to: string, token: string): Promise<void>
}

export interface Hooks {
  mailer: Mailer
  /** Optional wrapper around the D1 binding (used only by the TEST entrypoint for instrumentation). */
  wrapDb?: (db: D1Database) => D1Database
  /** Optional pre-router (used only by the TEST entrypoint for diagnostics). Never set in production. */
  preRoute?: (req: Request, env: Env, url: URL) => Promise<Response | null>
}

const enc = new TextEncoder()
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

async function hmacB64(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(msg)))))
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

export function makeAuth(env: Env, mailer: Mailer) {
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 10,
      // NO custom `password` option: the maintained default hashing is used unmodified.
      sendResetPassword: async ({ user, token }) => { await mailer.send(env, 'reset', user.email, token) },
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, token }) => { await mailer.send(env, 'verify', user.email, token) },
    },
    user: { deleteUser: { enabled: true } },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 },
    rateLimit: { enabled: true, window: 60, max: 100, storage: 'database', customRules: { '/sign-in/email': { window: 60, max: 5 } } },
    trustedOrigins: [env.BETTER_AUTH_URL],
    // Better Auth otherwise diffs the live schema on every `betterAuth()` instance (one per Workers request):
    // ~80 D1 rows read per request (sqlite_master + PRAGMA table_info for every table). The schema is applied from the
    // reviewed migrations/0001_init.sql and verified by tests, so the per-request diff is redundant. This does not
    // touch session verification, cookies, rate limits or authorization.
    advanced: { database: { validateSchema: false } },
  })
}

/**
 * Generic signed-event processor. The event shape is a SIMPLIFIED STAND-IN, not Polar or Paddle semantics
 * (see docs/architecture/CF-01-AUTH-AND-ENTITLEMENTS-CONTRACT.md). Payments are disabled in this PoC: the route
 * exists only to test the atomicity/replay/ordering mechanics and is inert without a configured WEBHOOK_SECRET.
 */
async function handleSignedEvent(req: Request, env: Env): Promise<Response> {
  if (!env.WEBHOOK_SECRET) return json({ error: 'disabled' }, 404)
  const body = await req.text()
  const id = req.headers.get('webhook-id') ?? ''
  const ts = req.headers.get('webhook-timestamp') ?? ''
  const sig = req.headers.get('webhook-signature') ?? ''
  const tsn = parseInt(ts, 10)
  if (!id || id.length > 128 || !sig || Number.isNaN(tsn) || Math.abs(Date.now() / 1000 - tsn) > 300 || body.length > 16_384) return json({ error: 'invalid' }, 422)
  const expected = 'v1,' + (await hmacB64(env.WEBHOOK_SECRET, `${id}.${ts}.${body}`))
  if (!sig.split(' ').some(s => safeEqual(s, expected))) return json({ error: 'invalid' }, 422)

  let ev: { type?: string; created_at?: number; data?: { user_id?: string; plan?: string; subscription_id?: string } }
  try { ev = JSON.parse(body) } catch { return json({ error: 'invalid' }, 422) }
  const d = ev.data ?? {}
  const plan = ev.type === 'subscription.revoked' ? 'free' : d.plan
  if (!d.user_id || !['free', 'plus', 'pro'].includes(plan ?? '') || typeof ev.created_at !== 'number') return json({ error: 'invalid' }, 422)

  // The user must exist, otherwise the event is NOT consumed and the provider retries (fixes the CF-00 PoC gap).
  const exists = await env.DB.prepare('SELECT 1 AS x FROM entitlement WHERE user_id = ?').bind(d.user_id).first()
  if (!exists) return json({ error: 'unmapped user' }, 409)

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
    if (/UNIQUE|constraint/i.test(m)) return json({ ok: true, duplicate: true })
    return json({ error: 'retry' }, 500)
  }
}

export function createHandler(hooks: Hooks) {
  return async function handle(req: Request, rawEnv: Env): Promise<Response> {
    const url = new URL(req.url)
    const env: Env = hooks.wrapDb ? { ...rawEnv, DB: hooks.wrapDb(rawEnv.DB) } : rawEnv

    if (hooks.preRoute) {
      const r = await hooks.preRoute(req, env, url)
      if (r) return r
    }

    const auth = makeAuth(env, hooks.mailer)

    if (url.pathname.startsWith('/api/auth/')) {
      const res = await auth.handler(req)
      if (url.pathname === '/api/auth/sign-up/email' && res.status === 200) {
        const b = (await res.clone().json()) as { user?: { id?: string } }
        if (b.user?.id) {
          await env.DB.prepare("INSERT OR IGNORE INTO entitlement (user_id, plan, updated_at) VALUES (?, 'free', ?)").bind(b.user.id, Date.now()).run()
        }
      }
      return res
    }

    if (url.pathname === '/api/webhooks/payments' && req.method === 'POST') return handleSignedEvent(req, env)

    const session = await auth.api.getSession({ headers: req.headers })
    const user = session?.user
    if (!user) return json({ error: 'unauthorized' }, 401)

    if (url.pathname === '/api/me' && req.method === 'GET') {
      const e = await env.DB.prepare('SELECT plan FROM entitlement WHERE user_id = ?').bind(user.id).first<{ plan: string }>()
      return json({ id: user.id, email: user.email, plan: e?.plan ?? 'free' })
    }
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
      if (!row) return json({ error: 'not found' }, 404)
      if (req.method === 'GET') return json(row)
      if (req.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM items WHERE id = ? AND user_id = ?').bind(m[1], user.id).run()
        return json({ ok: true })
      }
    }
    return json({ error: 'not found' }, 404)
  }
}
