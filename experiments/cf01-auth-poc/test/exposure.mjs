// Negative HTTP tests against the PRODUCTION-SHAPED entrypoint (wrangler.jsonc, src/worker.ts), run locally.
// Every diagnostic/migration/inspection route must be absent. Usage: node test/exposure.mjs http://localhost:8792
const base = process.argv[2] ?? 'http://localhost:8792'
const results = []
const rec = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  :: ' + d : ''}`) }
const paths = ['/__test/sql', '/__test/migrate', '/__test/schema', '/__test/stats', '/__test/stats?reset=1', '/__test/explain', '/__test/batch-atomicity', '/__test/', '/__test', '/__migrate', '/migrate', '/sql', '/debug', '/admin', '/outbox', '/api/outbox', '/api/debug', '/api/sql', '/api/migrate']
for (const p of paths) for (const m of ['GET', 'POST']) {
  const r = await fetch(base + p, { method: m, headers: { 'content-type': 'application/json' }, body: m === 'POST' ? JSON.stringify({ sql: 'SELECT name FROM sqlite_master' }) : undefined })
  const t = await r.text()
  rec(`${m} ${p} exposes nothing`, [401, 404].includes(r.status) && !/sqlite_master|"rows"|"statements"|"plan"|rows_read/.test(t), `status=${r.status}`)
}
// header spoofing / alternate flags must not matter
for (const h of [{ 'x-test': '1' }, { 'x-allow-test-endpoints': '1' }, { authorization: 'Bearer test' }]) {
  const r = await fetch(base + '/__test/sql', { method: 'POST', headers: { ...h, 'content-type': 'application/json' }, body: '{"sql":"select 1"}' })
  rec(`spoofed header ${Object.keys(h)[0]} does not unlock diagnostics`, r.status === 404 || r.status === 401, `status=${r.status}`)
}
// unauthenticated surface
rec('GET /api/me unauthenticated -> 401', (await fetch(base + '/api/me')).status === 401)
rec('GET /api/items unauthenticated -> 401', (await fetch(base + '/api/items')).status === 401)
// payment webhook is inert without a valid signature even when a secret is configured
const w = await fetch(base + '/api/webhooks/payments', { method: 'POST', headers: { 'webhook-id': 'x', 'webhook-timestamp': String(Math.floor(Date.now() / 1000)), 'webhook-signature': 'v1,AAAA' }, body: '{}' })
rec('webhook without valid signature -> 422', w.status === 422, `status=${w.status}`)
// mail cannot be sent (fail-closed mailer): sign-up must not silently succeed in sending
const su = await fetch(base + '/api/auth/sign-up/email', { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ email: 'x@example.test', password: 'Correct-Horse-Battery-1', name: 'x' }) })
rec('prod-shape sign-up cannot complete without a configured mailer (no token leak in response)', !/token/i.test(await su.text().then(t => t.replace(/"token":null/g, ''))) , `status=${su.status}`)
const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
