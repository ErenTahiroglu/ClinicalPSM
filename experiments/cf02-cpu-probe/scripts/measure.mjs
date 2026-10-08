// Bounded live measurement against a throwaway probe Worker. One group of sequential requests per minute so Cloudflare
// analytics (per-minute buckets) can attribute CPU time to the group. About 100 requests in total; no concurrency.
// usage: PROBE_URL=https://... PROBE_TOKEN_FILE=... node scripts/measure.mjs out.json
import { readFileSync, writeFileSync } from 'node:fs'
const url = process.env.PROBE_URL, token = readFileSync(process.env.PROBE_TOKEN_FILE, 'utf8').trim()
const out = process.argv[2] ?? 'measure-out.json'
const only = process.env.GROUPS ? process.env.GROUPS.split(',') : null
const all = [
  ['ping', '/ping', 10],
  ['pbkdf2-25k', '/pbkdf2/25000', 5],
  ['pbkdf2-50k', '/pbkdf2/50000', 5],
  ['pbkdf2-100k', '/pbkdf2/100000', 5],
  ['pbkdf2-200k', '/pbkdf2/200000', 5],
  ['pbkdf2-600k', '/pbkdf2/600000', 5],
  ['betterauth-hash', '/ba-hash', 5],
  ['betterauth-hash+verify', '/ba-verify', 5],
  ['d1-read', '/d1/read?id=1', 10],
  ['d1-write', '/d1/write', 5],
  ['d1-count', '/d1/count', 3],
  ['burst-ba-hash-x20', '/ba-hash', 20, 120],
]
const groups = all.filter(g => !only || only.includes(g[0]))
const results = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
for (const [name, path, n, gap = 700] of groups) {
  const now = new Date(); const wait = (60 - now.getUTCSeconds() + 3) * 1000
  await sleep(wait)
  const start = new Date().toISOString(); const rows = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    let r, body
    for (let a = 0; a < 3; a++) { try { r = await fetch(url + path, { headers: { 'x-probe-token': token } }); body = await r.text(); break } catch { await sleep(1500) } }
    if (!r) { rows.push({ status: 0, ms: 0, body: 'client network error' }); continue }
    rows.push({ status: r.status, ms: +(performance.now() - t).toFixed(1), body: body.slice(0, 160), cfRay: r.headers.get('cf-ray') })
    await sleep(gap)
  }
  results.push({ name, path, n, start, end: new Date().toISOString(), rows })
  console.log(name, rows.map(x => x.status).join(','), 'wall ms p50', rows.map(x => x.ms).sort((a, b) => a - b)[Math.floor(n / 2)])
  writeFileSync(out, JSON.stringify(results, null, 1))
}
