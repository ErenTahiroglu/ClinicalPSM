// Wall-clock cost of credential operations on local workerd (no CPU limit enforced locally; wall >= CPU).
import crypto from 'node:crypto'
const base = process.argv[2]; const mode = process.argv[3] ?? 'default'
await fetch(`${base}/__test/migrate`)
const h = { origin: base, 'content-type': 'application/json' }
const sql = async (q, p = []) => (await (await fetch(`${base}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: q, params: p }) })).json()).rows
const reg = [], log = []
for (let i = 0; i < 12; i++) {
  const email = `t${i}-${crypto.randomBytes(3).toString('hex')}@example.test`
  const password = mode === 'client-derived' ? crypto.randomBytes(32).toString('hex') : 'Correct-Horse-Battery-1'
  const ip = { 'x-forwarded-for': `10.1.${i}.1` }
  let t = performance.now()
  await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: { ...h, ...ip }, body: JSON.stringify({ email, password, name: 't' }) }); reg.push(performance.now() - t)
  const tok = (await sql("SELECT token FROM outbox WHERE to_email=? ORDER BY id DESC LIMIT 1", [email]))[0].token
  await fetch(`${base}/api/auth/verify-email?token=${tok}`, { headers: { ...h, ...ip } })
  t = performance.now()
  await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: { ...h, ...ip }, body: JSON.stringify({ email, password }) }); log.push(performance.now() - t)
}
const p = a => { a.sort((x, y) => x - y); return `p50=${a[6].toFixed(1)} max=${a[11].toFixed(1)}` }
console.log(`${mode}: sign-up wall ms ${p(reg)} | sign-in wall ms ${p(log)}`)
