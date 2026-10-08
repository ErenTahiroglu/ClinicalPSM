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
rec('default production build is noindex, has no sitemap, no HSTS', /noindex/.test(readFileSync('public/en/index.html', 'utf8')) && !existsSync('public/sitemap.xml') && !/Strict-Transport/.test(readFileSync('public/_headers', 'utf8')) && /Disallow: \//.test(readFileSync('public/robots.txt', 'utf8')))
rec('security.txt written with contact and expiry', /Contact: mailto:security@example.org/.test(readFileSync('public/.well-known/security.txt', 'utf8')) && /Expires: /.test(readFileSync('public/.well-known/security.txt', 'utf8')))
rec('operator identity rendered in footer and privacy page', ['en', 'tr'].every(l => ['index', 'privacy/index'].every(p => { const h = readFileSync(`public/${l}/${p.replace('index', '') ? p : 'index'}.html`, 'utf8'); return /Example Operator/.test(h) && /security@example\.org/.test(h) })))

r = run({ ...good, INDEXABLE: '1', HSTS_MAX_AGE: '300' })
const idx = readFileSync('public/en/index.html', 'utf8')
rec('indexable build: canonical, sitemap (10 urls), allow robots', r.status === 0 && /rel="canonical" href="https:\/\/www\.example\.org\/en\/"/.test(idx) && !/noindex/.test(idx) && (readFileSync('public/sitemap.xml', 'utf8').match(/<loc>/g) ?? []).length === 10 && /Allow: \//.test(readFileSync('public/robots.txt', 'utf8')))
rec('HSTS only when HSTS_MAX_AGE set (short value, no includeSubDomains/preload)', /Strict-Transport-Security: max-age=300\n/.test(readFileSync('public/_headers', 'utf8')) && !/preload|includeSubDomains/i.test(readFileSync('public/_headers', 'utf8')))
rec('preview build never sets INDEXABLE even when env asks', (run({ ...good, INDEXABLE: '1' }, []), !existsSync('public/sitemap.xml') && /noindex/.test(readFileSync('public/en/index.html', 'utf8'))))
run({}, [])
rec('preview build keeps placeholders and writes no security.txt', /set before launch/.test(readFileSync('public/en/privacy/index.html', 'utf8')) && !existsSync('public/.well-known/security.txt'))

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
