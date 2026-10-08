// Builds the DEPLOYABLE config (wrangler.jsonc) locally with --dry-run (no network, no deploy) and inspects the artifact.
// Any hit is a release blocker. Run: node scripts/build-and-inspect.mjs
import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const out = 'dist-prod'
rmSync(out, { recursive: true, force: true })
execFileSync('npx', ['wrangler', 'deploy', '-c', process.env.CF_CONFIG ?? 'wrangler.jsonc', '--dry-run', '--outdir', out], { stdio: 'inherit' })

const files = []
const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
walk(out)

const FORBIDDEN = [
  ['diagnostic route prefix', '/__test'],
  ['test-endpoint flag', 'ALLOW_TEST_ENDPOINTS'],
  ['arbitrary SQL helper', 'EXPLAIN QUERY PLAN'],
  ['outbox/token inspection table', 'outbox'],
  ['stats/trace instrumentation', 'rows_read'],
  ['test secret', 'test-only-secret'],
  ['test webhook secret', 'test-only-webhook'],
  ['local prod-shape secret', 'local-prod-shape'],
  ['dev secret (CF-00 PoC)', 'poc-only-secret'],
  ['dev webhook secret (CF-00 PoC)', 'poc-webhook-secret'],
  ['bespoke password mode', 'client-derived'],
  ['bespoke password verifier', 'cd1$'],
  ['test entrypoint', 'worker.test'],
]
let bad = 0
let total = 0, gz = 0
for (const f of files) {
  const text = readFileSync(f, 'utf8')
  if (/\.(js|mjs|json)$/.test(f)) { total += text.length; gz += gzipSync(text).length }
  for (const [why, needle] of FORBIDDEN) {
    if (text.includes(needle)) { console.error(`BLOCKER: ${f} contains "${needle}" (${why})`); bad++ }
  }
}
const cfg = readFileSync(process.env.CF_CONFIG ?? 'wrangler.jsonc', 'utf8').replace(/\/\/.*$/gm, '')
if (/"vars"\s*:/.test(cfg)) { console.error('BLOCKER: wrangler.jsonc defines [vars]'); bad++ }
if (/worker\.test/.test(cfg)) { console.error('BLOCKER: wrangler.jsonc references the test entrypoint'); bad++ }
console.log(`artifact files=${files.length} js+json=${(total / 1024).toFixed(0)} KiB (gzip ${(gz / 1024).toFixed(0)} KiB) [Free script-size limits: see CF-01 evidence doc]`)
console.log(bad ? `\nFAILED: ${bad} blocker(s)` : '\nOK: no diagnostic routes, test secrets or bespoke password code in the deployable artifact')
process.exit(bad ? 1 : 0)
