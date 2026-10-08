// Smoke tests for the vinext build running on local workerd (vite preview). Synthetic data, dummy secrets only.
// Usage: node experiments/cf00-vinext/smoke.mjs http://localhost:4173
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
const FIX = JSON.parse(readFileSync(new URL('./subscription.fixture.json', import.meta.url), 'utf8'))
const sub = (over, cust = {}) => ({ type: 'subscription.created', timestamp: '2026-10-01T00:00:00Z', data: { ...FIX, ...over, customer: { ...FIX.customer, ...cust } } })

const base = process.argv[2] ?? 'http://localhost:4173'
const SECRET = 'dummy-webhook-secret-for-local-tests' // matches .dev.vars.example (dummy). Polar's SDK base64-encodes the raw secret string before standardwebhooks decodes it, so the HMAC key is the raw bytes.
const results = []
const rec = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  :: ' + detail : ''}`) }

async function get(path, init = {}) {
  const t = performance.now()
  const res = await fetch(base + path, { redirect: 'manual', ...init })
  const body = await res.text()
  return { res, body, ms: performance.now() - t }
}

function sign(id, ts, payload) {
  const key = Buffer.from(SECRET, 'utf8')
  return 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64')
}
async function webhook(event, { badSig = false } = {}) {
  const payload = JSON.stringify(event)
  const id = 'msg_' + crypto.randomUUID()
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = badSig ? 'v1,AAAA' : sign(id, ts, payload)
  return get('/api/webhooks/polar', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': sig },
    body: payload,
  })
}

// ---- locale routing ----
for (const [p, loc] of [['/en', 'en'], ['/tr', 'tr'], ['/en/pricing', 'en'], ['/tr/pricing', 'tr'], ['/en/login', 'en'], ['/tr/login', 'tr']]) {
  const { res, body } = await get(p)
  rec(`GET ${p} 200 and <html lang="${loc}">`, res.status === 200 && body.includes(`lang="${loc}"`), `status=${res.status}`)
}
{
  const { res } = await get('/')
  rec('GET / redirects to a locale', [307, 308].includes(res.status) && /\/(en|tr)/.test(res.headers.get('location') ?? ''), `status=${res.status} loc=${res.headers.get('location')}`)
}
{
  const { body } = await get('/tr/pricing')
  rec('TR pricing shows Turkish paused-purchase text', body.includes('Geçici olarak kullanılamıyor'))
  const en = await get('/en/pricing')
  rec('EN pricing shows paused-purchase text and no hosted checkout URL', en.body.includes('Temporarily unavailable') && !en.body.includes('buy.polar.sh'))
}
// ---- protected routes (proxy.ts) ----
for (const p of ['/en/analyses', '/en/new', '/en/settings', '/tr/analyses']) {
  const { res } = await get(p)
  const loc = res.headers.get('location') ?? ''
  rec(`${p} unauthenticated redirects to login`, [307, 308].includes(res.status) && loc.endsWith(p.startsWith('/tr') ? '/tr/login' : '/en/login'), `status=${res.status} loc=${loc}`)
}
// ---- headers ----
{
  const { res } = await get('/en')
  const h = (n) => res.headers.get(n) ?? ''
  rec('CSP header present with frame-ancestors none + worker-src blob', /frame-ancestors 'none'/.test(h('content-security-policy')) && /worker-src 'self' blob:/.test(h('content-security-policy')))
  rec('X-Frame-Options DENY', h('x-frame-options') === 'DENY')
  rec('X-Content-Type-Options nosniff', h('x-content-type-options') === 'nosniff')
  rec('Referrer-Policy and Permissions-Policy present', !!h('referrer-policy') && !!h('permissions-policy'))
}
// ---- dynamic API routes (CP-00 hold) ----
for (const [m, p] of [['POST', '/api/analyses'], ['POST', '/api/analyses/00000000-0000-4000-8000-000000000000/upload'], ['POST', '/api/analyses/00000000-0000-4000-8000-000000000000/results']]) {
  const { res, body } = await get(p, { method: m, headers: { 'content-type': 'application/json' }, body: '{"name":"SYNTH"}' })
  rec(`${m} ${p} -> 503 hold`, res.status === 503 && body.includes('CLINICAL_DATA_WRITES_SUSPENDED') && !body.includes('SYNTH'), `status=${res.status}`)
}
{
  const { res } = await get('/api/analyses/x/upload', { method: 'GET' })
  rec('GET on write route -> 405', res.status === 405, `status=${res.status}`)
}
// ---- signed webhook ----
{
  const bad = await webhook({ type: 'subscription.created', data: {} }, { badSig: true })
  rec('webhook invalid signature -> 422', bad.res.status === 422, `status=${bad.res.status}`)
  const uid = crypto.randomUUID()
  const unknown = await webhook(sub({ id: 'sub_x', product_id: 'not_configured' }, { external_id: uid }))
  rec('webhook valid signature + unknown product -> 200 ignored', unknown.res.status === 200 && unknown.body.includes('ignored'), `status=${unknown.res.status} body=${unknown.body.slice(0, 80)}`)
  const known = await webhook(sub({ id: 'sub_x', product_id: 'dummy_plus' }, { external_id: uid }))
  rec('webhook valid signature + known product + unreachable DB -> 500 (retryable, never 200)', known.res.status === 500, `status=${known.res.status}`)
  const noGrant = await webhook(sub({ id: 'sub_x', product_id: 'dummy_plus', status: 'incomplete' }, { external_id: uid }))
  rec('webhook non-paying status -> 200 ignored (no DB call)', noGrant.res.status === 200 && noGrant.body.includes('ignored'), `status=${noGrant.res.status}`)
  const unmapped = await webhook(sub({ id: 'sub_x', product_id: 'dummy_plus' }, { external_id: null, email: null }))
  rec('webhook unmappable customer -> 422', unmapped.res.status === 422, `status=${unmapped.res.status}`)
  const stale = await get('/api/webhooks/polar', { method: 'POST', headers: { 'content-type': 'application/json', 'webhook-id': 'm', 'webhook-timestamp': '1', 'webhook-signature': sign('m', '1', '{}') }, body: '{}' })
  rec('webhook with stale timestamp rejected (replay window) -> 422', stale.res.status === 422, `status=${stale.res.status}`)
}
// ---- timing (wall clock, local, NOT Cloudflare CPU time) ----
{
  const samples = []
  for (let i = 0; i < 30; i++) samples.push((await get('/en/pricing')).ms)
  samples.sort((a, b) => a - b)
  console.log(`INFO  /en/pricing wall ms over 30 warm requests (local workerd): p50=${samples[15].toFixed(1)} p95=${samples[28].toFixed(1)} max=${samples[29].toFixed(1)}`)
}
const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
