// Fail-closed test for `node build.mjs --production`: no network, no browser. Builds into the real public/ dir, then restores a preview build.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const results = []
const rec = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  :: ' + d : ''}`) }
const run = (extra = {}, args = ['--production']) => spawnSync('node', ['build.mjs', ...args], {
  env: { PATH: process.env.PATH, ...extra }, encoding: 'utf8',
})
const good = { CONTACT_EMAIL: 'security@example.org', OPERATOR_NAME: 'Example Operator', CANONICAL_HOST: 'www.example.org' }

for (const [name, env] of [
  ['no environment', {}],
  ['missing CONTACT_EMAIL', { ...good, CONTACT_EMAIL: '' }],
  ['malformed CONTACT_EMAIL', { ...good, CONTACT_EMAIL: 'not-an-email' }],
  ['placeholder OPERATOR_NAME', { ...good, OPERATOR_NAME: '[operator]' }],
  ['missing CANONICAL_HOST', { ...good, CANONICAL_HOST: '' }],
  ['invalid CANONICAL_HOST', { ...good, CANONICAL_HOST: 'https://x.org/' }],
  ['invalid HSTS_MAX_AGE', { ...good, HSTS_MAX_AGE: '1y' }],
  ['invalid INDEXABLE', { ...good, INDEXABLE: 'yes' }],
]) {
  const r = run(env)
  rec(`production build refused: ${name}`, r.status === 1 && /refused/.test(r.stderr))
}

let r = run(good)
rec('production build succeeds with complete identity', r.status === 0, r.stderr.slice(0, 200))
rec('default production build is noindex, has no sitemap, no HSTS', /noindex/.test(readFileSync('public/en/index.html', 'utf8')) && !existsSync('public/sitemap.xml') && !/Strict-Transport/.test(readFileSync('public/_headers', 'utf8')) && !/Disallow: \//.test(readFileSync('public/robots.txt', 'utf8')))
rec('every noindex build sends X-Robots-Tag and noindex meta on root, EN, TR (no canonical, no sitemap, robots does not hide the directive)', ['index', 'en/index', 'tr/index', 'en/demo/index'].every(p => /name="robots" content="noindex"/.test(readFileSync(`public/${p}.html`, 'utf8')) && !/rel="canonical"/.test(readFileSync(`public/${p}.html`, 'utf8'))) && /X-Robots-Tag: noindex, nofollow/.test(readFileSync('public/_headers', 'utf8')))
rec('security.txt written with contact and expiry', /Contact: mailto:security@example.org/.test(readFileSync('public/.well-known/security.txt', 'utf8')) && /Expires: /.test(readFileSync('public/.well-known/security.txt', 'utf8')))
rec('operator identity rendered in footer and privacy page', ['en', 'tr'].every(l => ['index', 'privacy/index'].every(p => { const h = readFileSync(`public/${l}/${p.replace('index', '') ? p : 'index'}.html`, 'utf8'); return /Example Operator/.test(h) && /security@example\.org/.test(h) })))

r = run({ ...good, INDEXABLE: '1', HSTS_MAX_AGE: '300' })
const idx = readFileSync('public/en/index.html', 'utf8')
const root = readFileSync('public/index.html', 'utf8'), hdrs = readFileSync('public/_headers', 'utf8')
rec('indexable build: no contradictory signals (no X-Robots-Tag, no noindex on root/EN/TR/demo, canonical on every page, 404 stays noindex)', r.status === 0 && !/X-Robots-Tag/.test(hdrs) && ['index', 'en/index', 'tr/index', 'en/privacy/index'].every(p => { const h = readFileSync(`public/${p}.html`, 'utf8'); return !/noindex/.test(h) && /rel="canonical" href="https:\/\/www\.example\.org\//.test(h) }) && /rel="canonical" href="https:\/\/www\.example\.org\/"/.test(root) && /noindex/.test(readFileSync('public/404.html', 'utf8')))
rec('indexable build: canonical, sitemap (11 urls incl. root), allow robots + Sitemap line', r.status === 0 && /Sitemap: https:\/\/www\.example\.org\/sitemap\.xml/.test(readFileSync('public/robots.txt', 'utf8')) && /rel="canonical" href="https:\/\/www\.example\.org\/en\/"/.test(idx) && !/noindex/.test(idx) && (readFileSync('public/sitemap.xml', 'utf8').match(/<loc>/g) ?? []).length === 11 && /Allow: \//.test(readFileSync('public/robots.txt', 'utf8')))
rec('HSTS only when HSTS_MAX_AGE set (short value, no includeSubDomains/preload)', /Strict-Transport-Security: max-age=300\n/.test(readFileSync('public/_headers', 'utf8')) && !/preload|includeSubDomains/i.test(readFileSync('public/_headers', 'utf8')))
rec('preview build never sets INDEXABLE even when env asks', (run({ ...good, INDEXABLE: '1' }, []), !existsSync('public/sitemap.xml') && /noindex/.test(readFileSync('public/en/index.html', 'utf8'))))
run({}, [])
rec('preview build keeps placeholders and writes no security.txt', /set before launch/.test(readFileSync('public/en/privacy/index.html', 'utf8')) && !existsSync('public/.well-known/security.txt'))

// Privacy wording: no categorical "nothing reaches a server" claims anywhere in served text; routine hosting processing is acknowledged
{
  const claim = /nothing you do here is sent|never sent to a server|no (personal )?data (is|are|ever) (sent|reach)|hiçbir şey sunucuya gönderilmez|hiçbir sunucuya gönderilmeyecek|hiçbir veri .{0,30}gönderilmez/i
  const hits = []
  for (const l of ['en', 'tr']) for (const p of ['index', 'demo/index', 'pricing/index', 'limits/index', 'privacy/index']) { const h = readFileSync(`public/${l}/${p}.html`, 'utf8'); if (claim.test(h)) hits.push(`${l}/${p}`) }
  rec('no categorical "nothing is sent to any server" claim on any page', hits.length === 0, hits.join(','))
  rec('home and privacy pages acknowledge Cloudflare technical request processing (EN and TR)', ['en', 'tr'].every(l => /Cloudflare/.test(readFileSync(`public/${l}/index.html`, 'utf8')) && /Cloudflare/.test(readFileSync(`public/${l}/privacy/index.html`, 'utf8'))))
}

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
