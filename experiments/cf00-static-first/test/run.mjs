// Integration tests for the static-first PoC (Workers + D1 + Better Auth) against local workerd/D1.
// Synthetic accounts only. Usage: node test/run.mjs http://localhost:8790 [client-derived]
import crypto from 'node:crypto'

const base = process.argv[2] ?? 'http://localhost:8790'
const MODE = process.argv[3] ?? 'default'
const WEBHOOK_SECRET = 'poc-webhook-secret'
const results = []
const rec = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }
const sql = async (q, params = []) => (await (await fetch(`${base}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: q, params }) })).json()).rows

// client-derived mode: the browser derives the secret that is sent as "password"
const kdfCost = []
async function pw(email, password) {
  if (MODE !== 'client-derived') return password
  const t = performance.now()
  const salt = crypto.createHash('sha256').update('cf00:' + email.toLowerCase()).digest()
  const key = crypto.pbkdf2Sync(password, salt, 600_000, 32, 'sha256').toString('hex')
  kdfCost.push(performance.now() - t)
  return key
}

class Client {
  jar = new Map()
  ip = `10.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}.${crypto.randomInt(1,255)}`
  async req(path, { method = 'GET', body, headers = {} } = {}) {
    const t = performance.now()
    const res = await fetch(base + path, {
      method, redirect: 'manual',
      headers: { origin: base, 'x-forwarded-for': this.ip, 'content-type': 'application/json', cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [kv] = c.split(';'); const i = kv.indexOf('='); const k = kv.slice(0, i), v = kv.slice(i + 1)
      if (/max-age=0|expires=thu, 01 jan 1970/i.test(c) || v === '') this.jar.delete(k); else this.jar.set(k, v)
    }
    let data = null; const text = await res.text(); try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data, ms: performance.now() - t, headers: res.headers }
  }
}

const rnd = () => crypto.randomBytes(4).toString('hex')
const emailA = `a-${rnd()}@example.test`, emailB = `b-${rnd()}@example.test`
const PASS1 = 'Correct-Horse-Battery-1', PASS2 = 'New-Staple-Battery-2'

console.log(`MODE=${MODE}`)
console.log((await (await fetch(`${base}/__test/migrate`)).text()).slice(0, 40))
const A = new Client(), B = new Client(), anon = new Client()

// ---- registration + email verification ----
const su = await A.req('/api/auth/sign-up/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1), name: 'Synthetic A', plan: 'pro', emailVerified: true } })
rec('register user A', su.status === 200, `status=${su.status} ${su.ms.toFixed(0)}ms`)
const idA = su.data?.user?.id
rec('client-supplied emailVerified/plan ignored at sign-up', su.data?.user?.emailVerified === false)
rec('server created a FREE entitlement (client plan:"pro" ignored)', (await sql('SELECT plan FROM entitlement WHERE user_id = ?', [idA]))[0]?.plan === 'free')
const early = await A.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1) } })
rec('login blocked before email verification', early.status === 403, `status=${early.status}`)
const vtok = (await sql("SELECT token FROM outbox WHERE kind='verify' AND to_email=? ORDER BY id DESC LIMIT 1", [emailA]))[0]?.token
rec('verification email handed to the (stub) mail sender', !!vtok)
const ver = await anon.req(`/api/auth/verify-email?token=${encodeURIComponent(vtok)}`)
rec('email verification link works', [200, 302].includes(ver.status), `status=${ver.status}`)
const bad = await anon.req('/api/auth/verify-email?token=garbage')
rec('invalid verification token rejected', bad.status >= 300 && bad.status !== 200 || bad.data?.status === false || bad.status === 302, `status=${bad.status}`)

// ---- login / session ----
const li = await A.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1) } })
rec('login after verification', li.status === 200 && A.jar.size > 0, `status=${li.status} ${li.ms.toFixed(0)}ms`)
const wrong = await new Client().req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, 'wrong-password-xx') } })
rec('wrong password rejected (401)', wrong.status === 401, `status=${wrong.status}`)
const me = await A.req('/api/me')
rec('/api/me returns own identity and plan free', me.status === 200 && me.data.id === idA && me.data.plan === 'free')
rec('unauthenticated /api/me -> 401', (await anon.req('/api/me')).status === 401)
rec('forged session cookie -> 401', (await new Client().req('/api/me', { headers: { cookie: 'better-auth.session_token=forged.value' } })).status === 401)

// ---- session renewal ----
{
  // Better Auth refreshes when (expiresAt - expiresIn + updateAge) <= now. Age the session by 2h (updateAge = 1h).
  const row = (await sql('SELECT id, expiresAt FROM session WHERE userId = ?', [idA]))[0]
  const aged = new Date(Date.now() + 7 * 24 * 3600e3 - 2 * 3600e3).toISOString()
  await sql('UPDATE session SET expiresAt = ? WHERE id = ?', [aged, row.id])
  await A.req('/api/auth/get-session')
  const after = (await sql('SELECT expiresAt FROM session WHERE id = ?', [row.id]))[0]
  const gain = (new Date(after.expiresAt).getTime() - new Date(aged).getTime()) / 1000
  rec('session renewal extends expiry after updateAge', gain > 3600, `+${gain.toFixed(0)}s`)
}

// ---- logout ----
{
  const C = new Client(); await C.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1) } })
  rec('second session works', (await C.req('/api/me')).status === 200)
  const so = await C.req('/api/auth/sign-out', { method: 'POST', body: {} })
  rec('logout succeeds', so.status === 200)
  rec('after logout /api/me -> 401', (await C.req('/api/me')).status === 401)
}

// ---- password reset ----
{
  const rr = await anon.req('/api/auth/request-password-reset', { method: 'POST', body: { email: emailA, redirectTo: base + '/reset' } })
  rec('password reset request accepted', rr.status === 200, `status=${rr.status}`)
  const ghost = await anon.req('/api/auth/request-password-reset', { method: 'POST', body: { email: `nobody-${rnd()}@example.test`, redirectTo: base + '/reset' } })
  rec('reset for unknown email does not reveal existence (same status)', ghost.status === rr.status, `${ghost.status} vs ${rr.status}`)
  const tok = (await sql("SELECT token FROM outbox WHERE kind='reset' AND to_email=? ORDER BY id DESC LIMIT 1", [emailA]))[0]?.token
  rec('reset email handed to the (stub) mail sender', !!tok)
  const D = new Client(); await D.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1) } })
  const rs = await anon.req('/api/auth/reset-password', { method: 'POST', body: { token: tok, newPassword: await pw(emailA, PASS2) } })
  rec('password reset with token', rs.status === 200, `status=${rs.status}`)
  const reuse = await anon.req('/api/auth/reset-password', { method: 'POST', body: { token: tok, newPassword: await pw(emailA, 'Another-Pass-3x') } })
  rec('reset token is single-use', reuse.status >= 400, `status=${reuse.status}`)
  rec('old sessions revoked after reset', (await D.req('/api/me')).status === 401)
  const oldLogin = await new Client().req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS1) } })
  rec('old password no longer works', oldLogin.status === 401)
  const newLogin = await A.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS2) } })
  rec('new password works', newLogin.status === 200)
}

// ---- isolation between two users (application layer, no RLS) ----
{
  await B.req('/api/auth/sign-up/email', { method: 'POST', body: { email: emailB, password: await pw(emailB, PASS1), name: 'Synthetic B' } })
  const tokB = (await sql("SELECT token FROM outbox WHERE kind='verify' AND to_email=? ORDER BY id DESC LIMIT 1", [emailB]))[0]?.token
  await anon.req(`/api/auth/verify-email?token=${encodeURIComponent(tokB)}`)
  await B.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailB, password: await pw(emailB, PASS1) } })
  const made = await A.req('/api/items', { method: 'POST', body: { title: 'A-private-synthetic' } })
  const itemA = made.data.id
  rec('A creates an item', made.status === 201)
  rec('B cannot read A\'s item (404)', (await B.req(`/api/items/${itemA}`)).status === 404)
  rec('B list excludes A\'s item', !(await B.req('/api/items')).data.items.some(i => i.id === itemA))
  rec('B cannot delete A\'s item (404)', (await B.req(`/api/items/${itemA}`, { method: 'DELETE' })).status === 404)
  rec('A\'s item still exists', (await A.req(`/api/items/${itemA}`)).status === 200)
  rec('absent vs foreign item answer identically (no existence oracle)', (await B.req(`/api/items/${crypto.randomUUID()}`)).status === (await B.req(`/api/items/${itemA}`)).status)
  rec('unauthenticated items -> 401', (await anon.req('/api/items')).status === 401)
  rec('oversized title rejected', (await A.req('/api/items', { method: 'POST', body: { title: 'x'.repeat(201) } })).status === 422)
  // client cannot write entitlements
  for (const [m, p] of [['POST', '/api/me'], ['PUT', '/api/entitlement'], ['PATCH', '/api/me'], ['POST', '/api/entitlement']]) {
    const r = await A.req(p, { method: m, body: { plan: 'pro' } })
    rec(`client ${m} ${p} {plan:"pro"} has no effect`, [404, 405].includes(r.status), `status=${r.status}`)
  }
  rec('A still free after tampering attempts', (await sql('SELECT plan FROM entitlement WHERE user_id = ?', [idA]))[0]?.plan === 'free')
}

// ---- payment webhook: signature, atomicity, replay, ordering ----
{
  const send = async (event, { id = 'evt_' + crypto.randomUUID(), badSig = false, tsOffset = 0 } = {}) => {
    const body = JSON.stringify(event); const ts = String(Math.floor(Date.now() / 1000) + tsOffset)
    const sig = badSig ? 'v1,AAAA' : 'v1,' + crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${id}.${ts}.${body}`).digest('base64')
    const r = await fetch(`${base}/api/webhooks/payments`, { method: 'POST', headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sig }, body })
    return { status: r.status, data: await r.json(), id }
  }
  const ev = (type, plan, created_at) => ({ type, created_at, data: { user_id: idA, plan, subscription_id: 'sub_synth_1' } })
  const planNow = async () => (await sql('SELECT plan FROM entitlement WHERE user_id = ?', [idA]))[0]?.plan
  rec('webhook bad signature -> 422, no change', (await send(ev('subscription.active', 'pro', 1000), { badSig: true })).status === 422 && (await planNow()) === 'free')
  rec('webhook stale timestamp -> 422', (await send(ev('subscription.active', 'pro', 1000), { tsOffset: -3600 })).status === 422)
  const first = await send(ev('subscription.active', 'plus', 2000))
  rec('valid event applies entitlement server-side', first.status === 200 && first.data.applied === true && (await planNow()) === 'plus')
  rec('/api/me reflects server entitlement', (await A.req('/api/me')).data.plan === 'plus')
  const replay = await send(ev('subscription.active', 'plus', 2000), { id: first.id })
  rec('replay of the same event id is acknowledged and changes nothing', replay.status === 200 && replay.data.duplicate === true)
  rec('exactly one webhook_events row for the id', (await sql('SELECT count(*) AS n FROM webhook_events WHERE event_id = ?', [first.id]))[0].n === 1)
  const old = await send(ev('subscription.active', 'pro', 1500))
  rec('older out-of-order event does not overwrite newer state', old.status === 200 && old.data.applied === false && (await planNow()) === 'plus')
  const rev = await send(ev('subscription.revoked', 'free', 3000))
  rec('newer revoke downgrades', rev.data.applied === true && (await planNow()) === 'free')
  const late = await send(ev('subscription.active', 'plus', 2500))
  rec('late "active" arriving after revoke does not re-grant', late.data.applied === false && (await planNow()) === 'free')
  rec('invalid plan value rejected', (await send({ type: 'x', created_at: 5000, data: { user_id: idA, plan: 'enterprise' } })).status === 422)
  const at = await (await fetch(`${base}/__test/batch-atomicity`)).json()
  rec('D1 batch is atomic: failing statement rolls back the earlier INSERT', at.threw === true && at.leftover === 0, JSON.stringify(at))
}

// ---- rate limiting on login ----
{
  const R = new Client(); let last = 0
  for (let i = 0; i < 8; i++) last = (await R.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailB, password: await pw(emailB, 'bad-' + i + '-passwordx') } })).status
  rec('repeated failed logins are rate limited (429)', last === 429, `last=${last}`)
}

// ---- account deletion ----
{
  const E = new Client(); await new Promise(r => setTimeout(r, 100))
  await E.req('/api/auth/sign-in/email', { method: 'POST', body: { email: emailA, password: await pw(emailA, PASS2) } })
  const idsBefore = await sql('SELECT (SELECT count(*) FROM items WHERE user_id=?) AS i, (SELECT count(*) FROM entitlement WHERE user_id=?) AS e', [idA, idA])
  const del = await E.req('/api/auth/delete-user', { method: 'POST', body: { password: await pw(emailA, PASS2) } })
  rec('account deletion request succeeds', del.status === 200, `status=${del.status}`)
  const after = await sql('SELECT (SELECT count(*) FROM user WHERE id=?) AS u, (SELECT count(*) FROM session WHERE userId=?) AS s, (SELECT count(*) FROM account WHERE userId=?) AS a, (SELECT count(*) FROM items WHERE user_id=?) AS i, (SELECT count(*) FROM entitlement WHERE user_id=?) AS e', [idA, idA, idA, idA, idA])
  rec('deletion cascades user/session/account/items/entitlement', JSON.stringify(after[0]) === JSON.stringify({ u: 0, s: 0, a: 0, i: 0, e: 0 }), `before=${JSON.stringify(idsBefore[0])} after=${JSON.stringify(after[0])}`)
  rec("other user's data untouched by deletion", (await B.req('/api/me')).status === 200)
}

if (MODE === 'client-derived') console.log(`INFO  client-side PBKDF2(600k) cost on this machine: p50=${kdfCost.sort((a,b)=>a-b)[Math.floor(kdfCost.length/2)].toFixed(0)}ms (runs in the user's browser, not on Cloudflare)`)
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed (${MODE})`)
process.exit(failed.length ? 1 : 0)
