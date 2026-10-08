// Wall-clock timing of SSR routes on LOCAL workerd. Wall >= CPU, so these are upper-bound hints only.
// They do NOT prove the Cloudflare Free 10 ms CPU limit is met (no limit is enforced locally).
const base = process.argv[2] ?? 'http://localhost:4173'
const routes = ['/en', '/tr', '/en/pricing', '/tr/pricing', '/en/login', '/en/register', '/en/analyses']
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))]
for (const r of routes) {
  const first = performance.now(); await fetch(base + r, { redirect: 'manual' }); const cold = performance.now() - first
  const s = []
  for (let i = 0; i < 50; i++) { const t = performance.now(); const res = await fetch(base + r, { redirect: 'manual' }); await res.arrayBuffer(); s.push(performance.now() - t) }
  s.sort((a, b) => a - b)
  console.log(`${r.padEnd(14)} first=${cold.toFixed(1)}ms p50=${q(s, .5).toFixed(1)} p95=${q(s, .95).toFixed(1)} max=${s[s.length - 1].toFixed(1)}`)
}
