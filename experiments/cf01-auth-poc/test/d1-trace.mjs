// Explains D1 rows read per authenticated request: per-statement trace + EXPLAIN QUERY PLAN. Local D1 metadata.
import crypto from 'node:crypto'
const base = process.argv[2] ?? 'http://localhost:8790'
const h = { origin: base, 'content-type': 'application/json', 'x-forwarded-for': '10.8.8.8' }
const get = async (p) => (await fetch(base + p)).json()
await get('/__test/migrate')
const email = `t-${crypto.randomBytes(3).toString('hex')}@example.test`, password = 'Correct-Horse-Battery-1'
const sql = async (q, p = []) => (await (await fetch(`${base}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: q, params: p }) })).json()).rows
await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, name: 't' }) })
const tok = (await sql('SELECT token FROM outbox WHERE to_email=? ORDER BY id DESC LIMIT 1', [email]))[0].token
await fetch(`${base}/api/auth/verify-email?token=${tok}`, { headers: h })
const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password }) })
const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
// 1. one authenticated request, statement by statement
await get('/__test/stats?reset=1')
await fetch(`${base}/api/me`, { headers: { ...h, cookie } })
const s = await get('/__test/stats?trace=1')
console.log(`/api/me: ${s.queries} statements, rows_read=${s.rows_read}, rows_written=${s.rows_written}`)
for (const t of s.trace) console.log(`  read=${String(t.rows_read).padStart(3)} write=${t.rows_written}  ${t.sql.replace(/\s+/g, ' ').slice(0, 150)}`)
// 2. table sizes at the time (explains scans)
const sizes = {}
for (const tname of ['user', 'session', 'account', 'verification', 'rateLimit', 'entitlement']) sizes[tname] = (await sql(`SELECT count(*) AS n FROM "${tname}"`))[0].n
console.log('row counts:', JSON.stringify(sizes))
// 3. query plans for each distinct statement
const seen = new Set()
for (const t of s.trace) {
  if (seen.has(t.sql) || /^\(batch/.test(t.sql)) continue; seen.add(t.sql)
  const q = t.sql.replace(/\?\d*/g, 'NULL').replace(/\$\d+/g, 'NULL')
  const p = await (await fetch(`${base}/__test/explain`, { method: 'POST', body: JSON.stringify({ sql: q }) })).json()
  console.log('PLAN', q.replace(/\s+/g, ' ').slice(0, 90), '=>', JSON.stringify((p.plan ?? []).map(x => x.detail)))
}
