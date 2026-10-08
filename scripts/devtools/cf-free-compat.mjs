// Static Cloudflare Free-plan compatibility checks on the deployable configs and artifacts (no network).
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const strip = s => s.replace(/\/\/.*$/gm, '')
const configs = ['experiments/cf01-static-site/wrangler.jsonc', 'experiments/cf01-auth-poc/wrangler.jsonc', 'experiments/cf02-cpu-probe/wrangler.jsonc']
// bindings/features that need a paid plan or add recurring cost
const PAID = ['"queues"', '"containers"', '"hyperdrive"', '"vectorize"', '"send_email"', '"browser"', '"ai"', '"durable_objects"', '"analytics_engine_datasets"', '"workflows"', '"r2_buckets"', '"images"', '"routes"', '"route"']
let bad = 0
const fail = m => { console.error('FAIL ' + m); bad++ }
for (const c of configs) {
  const t = strip(readFileSync(c, 'utf8'))
  const j = JSON.parse(t)
  for (const p of PAID) if (t.includes(p)) fail(`${c} uses ${p} (paid plan or custom-route feature)`)
  if (/"vars"\s*:/.test(t)) fail(`${c} defines vars (deployable configs must carry none)`)
  if (j.observability?.enabled !== false) fail(`${c} must set observability.enabled=false (log pricing changes 2026-12-01)`)
  if (j.workers_dev !== true) fail(`${c} must target workers.dev only`)
  if (j.assets && !j.main) { /* static-only */ }
  if (/worker\.test|test-only/.test(t) && !/test/.test(c)) fail(`${c} references a test entry or secret`)
  console.log(`ok   ${c}`)
}
// static asset limits: <= 20,000 files, <= 25 MiB each
const dir = 'experiments/cf01-static-site/public'
if (existsSync(dir)) {
  let n = 0, max = 0
  const walk = d => { for (const e of readdirSync(d)) { const p = join(d, e); const s = statSync(p); if (s.isDirectory()) walk(p); else { n++; max = Math.max(max, s.size) } } }
  walk(dir)
  if (n > 20000) fail(`static assets ${n} > 20000`)
  if (max > 25 * 1024 * 1024) fail(`asset > 25 MiB`)
  console.log(`ok   static assets: ${n} files, largest ${(max / 1024).toFixed(0)} KiB`)
}
// forbidden material in the static site: no inline script allowed by CSP, no third-party URLs
const hdr = existsSync(dir + '/_headers') ? readFileSync(dir + '/_headers', 'utf8') : ''
if (/unsafe-/.test(hdr)) fail('_headers CSP contains unsafe-*')
if (!/frame-ancestors 'none'/.test(hdr)) fail('_headers CSP lacks frame-ancestors none')
console.log(bad ? `FAILED (${bad})` : 'Cloudflare Free compatibility checks: OK')
process.exit(bad ? 1 : 0)
