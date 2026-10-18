// Cumulative gate runner. usage: node scripts/devtools/gates.mjs --phase CF-01 [--only base|cf01] [--strict]
// Statuses: PASS | FAIL | BLOCKED (prerequisite missing) | NOT_APPLICABLE (phase not yet approved).
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const args = process.argv.slice(2)
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const phase = arg('--phase', 'BASE'), only = arg('--only', null), strict = args.includes('--strict')
const cfg = JSON.parse(readFileSync(new URL('../../docs/devtools/gates.json', import.meta.url), 'utf8'))
const idx = p => cfg.phases.indexOf(p)
if (idx(phase) < 0) { console.error(`unknown phase ${phase}`); process.exit(2) }

function missing(need) {
  if (need === 'gitleaks') {
    const r = spawnSync('bash', ['scripts/devtools/check-tools.sh'], { encoding: 'utf8' })
    return /gitleaks\s+PASS/.test(r.stdout) ? null : 'gitleaks not installed/pinned (scripts/devtools/install-gitleaks.sh)'
  }
  if (need === 'browser') {
    const exe = process.env.PW_EXECUTABLE ?? '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
    return existsSync(exe) || process.env.PW_EXECUTABLE === 'playwright' ? null : `no browser at ${exe} (set PW_EXECUTABLE)`
  }
  return null
}

const rows = []
for (const g of cfg.gates) {
  if (only && !g.id.startsWith(only)) continue
  let status, detail = ''
  if (idx(g.phase) > idx(phase)) { status = 'NOT_APPLICABLE'; detail = `phase ${g.phase} not approved yet` }
  else if (g.cmd === null) { status = 'FAIL'; detail = 'mandatory gate not implemented' }
  else {
    const m = g.needs ? missing(g.needs) : null
    if (m) { status = 'BLOCKED'; detail = m }
    else {
      const t = Date.now()
      const r = spawnSync('bash', ['-c', g.cmd], { encoding: 'utf8', env: { ...process.env, ...(g.env ?? {}) }, maxBuffer: 64 * 1024 * 1024 })
      status = r.status === 0 ? 'PASS' : 'FAIL'
      detail = `${((Date.now() - t) / 1000).toFixed(0)}s` + (r.status === 0 ? '' : ` exit=${r.status}`)
      if (r.status !== 0) {
        // never echo possible secret material: redacted tail of output only
        const tail = (r.stdout + r.stderr).split('\n').slice(-12).join('\n').replace(/[A-Za-z0-9_\-]{32,}/g, '[long-token-omitted]')
        console.error(`--- ${g.id} output tail ---\n${tail}`)
      }
    }
  }
  rows.push({ id: g.id, phase: g.phase, status, detail })
}
console.log(`\nGATE MATRIX (approved phase: ${phase})`)
for (const r of rows) console.log(`${r.status.padEnd(15)} ${r.id.padEnd(34)} ${r.detail}`)
const count = s => rows.filter(r => r.status === s).length
console.log(`\nPASS=${count('PASS')} FAIL=${count('FAIL')} BLOCKED=${count('BLOCKED')} NOT_APPLICABLE=${count('NOT_APPLICABLE')}`)
writeFileSync('.gates-report.json', JSON.stringify({ phase, rows }, null, 1))
process.exit(count('FAIL') || (strict && count('BLOCKED')) ? 1 : 0)
