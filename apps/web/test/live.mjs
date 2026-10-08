// Live HTTP acceptance checks against a deployed URL (staging). Read-only GET/HEAD/POST-405 probes; no credentials.
// usage: node test/live.mjs https://<host>   (expects a PREVIEW/noindex build; pass --indexable to expect the indexable profile)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, relative } from 'node:path'

const base = (process.argv[2] ?? '').replace(/\/$/, ''), indexable = process.argv.includes('--indexable')
if (!/^https:\/\//.test(base)) { console.error('usage: node test/live.mjs https://host'); process.exit(2) }
const results = []
const rec = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  :: ' + d : ''}`) }
const get = (p, init = {}) => fetch(base + p, { redirect: 'manual', ...init })
const sha = b => createHash('sha256').update(b).digest('hex')

// 1. deployed bytes == local build bytes (integrity, nothing extra reachable by name)
const files = []
const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk('public')
let mism = []
for (const f of files) {
  const rel = relative('public', f)
  if (rel === '_headers') continue
  const url = rel === 'index.html' ? '/' : '/' + rel.replace(/index\.html$/, '')
  const r = await get(url)
  const live = Buffer.from(await r.arrayBuffer())
  if (r.status !== 200 && !(rel === '404.html')) mism.push(`${url}:${r.status}`)
  else if (rel !== '404.html' && sha(live) !== sha(readFileSync(f))) mism.push(`${url}:hash`)
}
rec(`all ${files.length - 1} built files are served and byte-identical to the local build`, mism.length === 0, mism.join(','))

// 2. codes
for (const p of ['/', '/en/', '/tr/', '/en/demo/', '/tr/demo/', '/en/pricing/', '/tr/pricing/', '/en/limits/', '/tr/limits/', '/en/privacy/', '/tr/privacy/', '/robots.txt', '/assets/psm-worker.js']) {
  const r = await get(p); rec(`GET ${p} -> 200`, r.status === 200, String(r.status))
}
for (const p of ['/en', '/tr/demo']) { const r = await get(p); const l = r.headers.get('location') ?? ''; rec(`GET ${p} redirects once to its trailing-slash form on the same host`, [301, 307, 308].includes(r.status) && (l === p + '/' || l === base + p + '/'), `${r.status} ${l}`) }
const nf = await get('/definitely-missing'); const nfb = await nf.text()
rec('unknown path -> 404 with bilingual page', nf.status === 404 && /Page not found/.test(nfb) && /Sayfa bulunamadı/.test(nfb), String(nf.status))

// 3. nothing sensitive or diagnostic is reachable (must be 404, never 200/3xx)
const hidden = ['/.env', '/.env.local', '/.dev.vars', '/.git/config', '/.git/HEAD', '/wrangler.jsonc', '/wrangler.staging.local.jsonc', '/package.json', '/package-lock.json', '/build.mjs', '/src/content.json', '/test/site.mjs', '/node_modules/', '/.vscode/settings.json',
  '/api/me', '/api/auth/sign-up/email', '/api/auth/sign-in/email', '/api/upload', '/api/analyses', '/api/webhooks/polar', '/__diag', '/debug', '/admin', '/login', '/register', '/dashboard', '/.well-known/security.txt', '/sitemap.xml', '/psm-worker.js']
const bad = []
for (const p of hidden) { const r = await get(p); if (r.status !== 404) bad.push(`${p}:${r.status}`) }
rec(`${hidden.length} sensitive/diagnostic/auth/upload/payment paths all 404`, bad.length === 0, bad.join(','))
for (const m of ['POST', 'PUT', 'DELETE']) { const r = await get('/en/', { method: m, body: m === 'DELETE' ? undefined : 'x' }); rec(`${m} /en/ is not accepted (no write surface)`, r.status >= 400 || r.status === 405, String(r.status)) }

// 4. open-redirect and loop probes: no response may point off-host
const probes = ['//evil.example/', '/\\evil.example', '/en//evil.example', '/%2f%2fevil.example', '/?next=https://evil.example', '/en/?redirect=//evil.example', 'https://evil.example/']
const offhost = []
for (const p of probes) { try { const r = await get(p.startsWith('http') ? '/' : p, p.startsWith('http') ? { headers: { Host: 'evil.example' } } : {}); const l = r.headers.get('location'); if (l && new URL(l, base).origin !== new URL(base).origin) offhost.push(`${p}->${l}`) } catch (e) { /* refusing to send is fine */ } }
rec('no probe produces a redirect to another origin (no open redirect)', offhost.length === 0, offhost.join(','))
let hops = 0, cur = '/en', loop = false; const seen = new Set()
while (hops < 6) { const r = await get(cur); const l = r.headers.get('location'); if (!l) break; cur = new URL(l, base).pathname; if (seen.has(cur)) { loop = true; break } seen.add(cur); hops++ }
rec('trailing-slash redirect chain terminates (no loop)', !loop && hops <= 2, `${hops} hop(s)`)
const plain = await fetch(base.replace('https://', 'http://') + '/en/', { redirect: 'manual' }).then(r => r.status).catch(() => 0)
console.log(`INFO  plain-http on this host answers ${plain} (workers.dev behaviour; the custom domain must enforce HTTPS via Always Use HTTPS, verified by verify-cutover.sh --post)`)

// 5. headers on html, asset, 404
const must = (h, name, re) => re.test(h.get(name) ?? '')
for (const p of ['/en/', '/tr/privacy/', '/assets/demo.js', '/definitely-missing']) {
  const h = (await get(p)).headers
  rec(`headers ${p}`, must(h, 'content-security-policy', /default-src 'none'/) && !/unsafe-/.test(h.get('content-security-policy') ?? '') && must(h, 'content-security-policy', /frame-ancestors 'none'/) && must(h, 'x-content-type-options', /nosniff/) && must(h, 'x-frame-options', /DENY/i) && must(h, 'referrer-policy', /no-referrer/) && must(h, 'permissions-policy', /camera=\(\)/) && must(h, 'cross-origin-opener-policy', /same-origin/) && !h.get('set-cookie'), '')
  if (!indexable) rec(`noindex header ${p}`, must(h, 'x-robots-tag', /noindex/), h.get('x-robots-tag') ?? 'missing')
}
const hs = (await get('/en/')).headers
rec('no HSTS on staging build (HSTS_MAX_AGE unset)', !hs.get('strict-transport-security'), hs.get('strict-transport-security') ?? '')
const rb = await (await get('/robots.txt')).text()
rec('robots.txt does not Disallow (noindex directive must stay visible)', !/Disallow:\s*\//.test(rb) || indexable, rb.replace(/\n/g, ' | '))
for (const p of ['/en/', '/tr/', '/']) { const t = await (await get(p)).text(); rec(`${p} has meta noindex and no canonical`, indexable || (/name="robots" content="noindex"/.test(t) && !/rel="canonical"/.test(t))) }

// 6. content hygiene across every built text file served
const secretRe = /(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}|sbp_[a-f0-9]{20,}|sk_(live|test)_[A-Za-z0-9]{10,}|-----BEGIN [A-Z ]*KEY|supabase\.co|vercel\.app|polar\.sh|checkout)/i
const leaks = []
for (const f of files) if (/\.(html|js|css|txt|json)$/.test(f)) { const t = readFileSync(f, 'utf8'); const m = t.match(secretRe); if (m) leaks.push(`${relative('public', f)}:${m[1].slice(0, 12)}`) }
rec('no secret-shaped strings, legacy backend hostnames or checkout references in any served file', leaks.length === 0, leaks.join(','))

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
