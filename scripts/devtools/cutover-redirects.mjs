// Redirect-chain and HTTPS evaluation for the clinicalpsm.com cutover. Read-only GET requests, no credentials.
// Pure evaluation (`evaluate`) is unit-tested with synthetic chains in cutover-redirects.test.mjs; `walk` takes an injectable fetch.
//   live:  node scripts/devtools/cutover-redirects.mjs [--permanent]
//   env:   CUTOVER_APEX (clinicalpsm.com) CUTOVER_WWW (www.clinicalpsm.com) MAX_HOPS (4)
import { pathToFileURL } from 'node:url'

export const REDIRECT = new Set([301, 302, 303, 307, 308])

// Follow redirects manually. Returns { hops: [{url,status,location}], end: 'final'|'loop'|'limit'|'error'|'bad-location', error? }
export async function walk(start, fetchFn, maxHops = 8) {
  const hops = [], seen = new Set()
  let url = start
  for (let i = 0; i <= maxHops; i++) {
    if (seen.has(url)) return { hops, end: 'loop' }
    seen.add(url)
    let r
    try { r = await fetchFn(url) } catch (e) { hops.push({ url, status: 0, location: null }); return { hops, end: 'error', error: String(e?.cause?.code ?? e?.message ?? e) } }
    const location = r.location ?? null
    hops.push({ url, status: r.status, location })
    if (!REDIRECT.has(r.status)) return { hops, end: 'final' }
    if (!location) return { hops, end: 'bad-location' }
    try { url = new URL(location, url).href } catch { return { hops, end: 'bad-location' } }
  }
  return { hops, end: 'limit' }
}

// expect: { host (canonical), allowed: [hosts], path, search, maxRedirects, permanent, finalStatus }
// A "probe" (expect.probe=true) only requires: no loop, bounded, nothing leaves the allowed hosts, no error.
export function evaluate(result, expect) {
  const out = []
  const add = (id, ok, detail = '') => out.push({ id, ok, detail })
  const { hops, end } = result
  const redirects = hops.filter(h => REDIRECT.has(h.status)).length
  const hosts = hops.map(h => new URL(h.url).host)
  add('no redirect loop', end !== 'loop')
  add('bounded chain', end !== 'limit' && redirects <= (expect.maxRedirects ?? 4), `${redirects} redirect(s)`)
  add('no fetch/TLS error', end !== 'error', result.error ?? '')
  add('every Location is valid', end !== 'bad-location')
  const off = hosts.filter(h => !expect.allowed.includes(h))
  add('no off-domain hop', off.length === 0, off.join(','))
  // a Location that points off-domain is a failure even if the walker stopped before fetching it
  const lastLoc = hops.at(-1)?.location
  if (lastLoc) { try { const h = new URL(lastLoc, hops.at(-1).url).host; add('last Location stays on allowed hosts', expect.allowed.includes(h), h) } catch { /* covered by bad-location */ } }
  if (expect.probe) return out
  const last = hops.at(-1)
  const fin = last ? new URL(last.url) : null
  add('chain ends in a final response', end === 'final')
  add('final scheme is https', fin?.protocol === 'https:', fin?.protocol ?? '')
  add('final host is the canonical host', fin?.host === expect.host, fin?.host ?? '')
  add('path preserved', fin?.pathname === expect.path, `${fin?.pathname} vs ${expect.path}`)
  add('query preserved', (fin?.search ?? '') === (expect.search ?? ''), `${fin?.search} vs ${expect.search ?? ''}`)
  add(`final response is ${expect.finalStatus ?? 200}`, last?.status === (expect.finalStatus ?? 200), String(last?.status))
  if (hops[0] && new URL(hops[0].url).protocol === 'http:') add('http start was upgraded (at least one redirect)', redirects >= 1 && fin?.protocol === 'https:', `${redirects}`)
  const statuses = hops.filter(h => REDIRECT.has(h.status)).map(h => h.status)
  add(expect.permanent ? 'all redirects are permanent (301/308)' : 'redirect statuses are 301/302/307/308', statuses.every(s => expect.permanent ? s === 301 || s === 308 : [301, 302, 307, 308].includes(s)), statuses.join(','))
  return out
}

export const liveFetch = async url => {
  const r = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'clinicalpsm-cutover-check/1' }, signal: AbortSignal.timeout(20000) })
  await r.arrayBuffer()
  return { status: r.status, location: r.headers.get('location') }
}

export function cases(apex, www) {
  const allowed = [apex, www]
  const c = (name, start, extra = {}) => ({ name, start, expect: { host: www, allowed, ...extra } })
  return [
    c('http apex -> https www, path+query', `http://${apex}/en/pricing/?a=1&b=two`, { path: '/en/pricing/', search: '?a=1&b=two' }),
    c('https apex -> https www, path+query', `https://${apex}/tr/privacy/?x=1`, { path: '/tr/privacy/', search: '?x=1' }),
    c('http www -> https www, path+query', `http://${www}/en/limits/?q=%C3%A7`, { path: '/en/limits/', search: '?q=%C3%A7' }),
    c('https www serves directly', `https://${www}/en/`, { path: '/en/', search: '', maxRedirects: 0 }),
    c('http apex root', `http://${apex}/`, { path: '/', search: '' }),
    ...['//evil.example/', '/?next=https://evil.example', '/%2f%2fevil.example', '/\\evil.example', '/en//evil.example/'].flatMap(p => [
      { name: `probe https apex ${p}`, start: `https://${apex}${p}`, expect: { allowed, probe: true } },
      { name: `probe http www ${p}`, start: `http://${www}${p}`, expect: { allowed, probe: true } }]),
  ]
}

async function main() {
  const apex = process.env.CUTOVER_APEX ?? 'clinicalpsm.com', www = process.env.CUTOVER_WWW ?? 'www.clinicalpsm.com'
  const permanent = process.argv.includes('--permanent'), maxRedirects = Number(process.env.MAX_HOPS ?? 4)
  let bad = 0
  for (const k of cases(apex, www)) {
    const res = evaluate(await walk(k.start, liveFetch), { ...k.expect, permanent, maxRedirects: k.expect.maxRedirects ?? maxRedirects })
    const f = res.filter(r => !r.ok)
    console.log(`${f.length ? 'FAIL' : 'PASS'}   ${k.name}${f.length ? ' :: ' + f.map(x => `${x.id} [${x.detail}]`).join('; ') : ''}`)
    bad += f.length
  }
  process.exit(bad ? 1 : 0)
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
