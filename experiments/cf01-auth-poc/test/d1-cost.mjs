// Measures D1 rows read/written per user flow (local D1 metadata). Used for the free-tier budget.
import crypto from 'node:crypto'
const base = process.argv[2]
const h = { origin: base, 'content-type': 'application/json', 'x-forwarded-for': '10.7.7.7' }
const sql = async (q, p = []) => (await (await fetch(`${base}/__test/sql`, { method: 'POST', body: JSON.stringify({ sql: q, params: p }) })).json()).rows
const stat = async (reset) => (await fetch(`${base}/__test/stats${reset ? '?reset=1' : ''}`)).json()
await fetch(`${base}/__test/migrate`)
const email = `m-${crypto.randomBytes(3).toString('hex')}@example.test`, password = 'Correct-Horse-Battery-1'
const out = {}
async function flow(name, fn) { await stat(true); await fn(); out[name] = await stat() }
let cookie = ''
await flow('sign-up', async () => { await fetch(`${base}/api/auth/sign-up/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password, name: 'm' }) }) })
const tok = (await sql('SELECT token FROM outbox WHERE to_email=? ORDER BY id DESC LIMIT 1', [email]))[0].token
await flow('verify-email', async () => { await fetch(`${base}/api/auth/verify-email?token=${tok}`, { headers: h }) })
await flow('sign-in', async () => { const r = await fetch(`${base}/api/auth/sign-in/email`, { method: 'POST', headers: h, body: JSON.stringify({ email, password }) }); cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') })
await flow('authenticated read (/api/me)', async () => { await fetch(`${base}/api/me`, { headers: { ...h, cookie } }) })
await flow('create item', async () => { await fetch(`${base}/api/items`, { method: 'POST', headers: { ...h, cookie }, body: JSON.stringify({ title: 'x' }) }) })
console.log(JSON.stringify(out, null, 1))
