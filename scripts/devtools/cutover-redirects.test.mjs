// Local synthetic redirect-chain tests (no network). Each scenario is a fake site: URL -> {status, location}.
import { walk, evaluate, cases } from './cutover-redirects.mjs'
const A = 'clinicalpsm.com', W = 'www.clinicalpsm.com', allowed = [A, W]
const site = routes => async url => routes[url] ?? { status: 404, location: null }
const ok = (status = 200) => ({ status, location: null })
const to = (loc, status = 301) => ({ status, location: loc })
const good = { host: W, allowed, path: '/en/pricing/', search: '?a=1&b=two' }
const results = []
const t = async (name, routes, start, expect, wantFail) => {
  const res = evaluate(await walk(start, site(routes)), expect)
  const failed = res.filter(r => !r.ok).map(r => r.id)
  const pass = wantFail ? failed.some(f => f.includes(wantFail)) : failed.length === 0
  results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : '  :: ' + JSON.stringify({ failed, wantFail })}`)
}
const S = 'http://clinicalpsm.com/en/pricing/?a=1&b=two'

// positive chains
await t('http apex -> https apex -> https www (Always Use HTTPS adds a hop)', { [S]: to('https://clinicalpsm.com/en/pricing/?a=1&b=two', 308), 'https://clinicalpsm.com/en/pricing/?a=1&b=two': to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good)
await t('http apex -> https www in one hop', { [S]: to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good)
await t('3-hop chain (http apex -> http www -> https www) is still accepted', { [S]: to('http://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'http://www.clinicalpsm.com/en/pricing/?a=1&b=two': to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two', 308), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good)
await t('permanent mode accepts 301/308', { [S]: to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two', 308), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, { ...good, permanent: true })
await t('www served directly with zero redirects', { 'https://www.clinicalpsm.com/en/': ok() }, 'https://www.clinicalpsm.com/en/', { host: W, allowed, path: '/en/', search: '', maxRedirects: 0 })

// negative chains: each must be detected
await t('NEG http never upgraded (200 on http)', { [S]: ok() }, S, good, 'final scheme is https')
await t('NEG http apex redirected only to http www', { [S]: to('http://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'http://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good, 'final scheme is https')
await t('NEG query dropped', { [S]: to('https://www.clinicalpsm.com/en/pricing/'), 'https://www.clinicalpsm.com/en/pricing/': ok() }, S, good, 'query preserved')
await t('NEG path dropped (redirect to root)', { [S]: to('https://www.clinicalpsm.com/?a=1&b=two'), 'https://www.clinicalpsm.com/?a=1&b=two': ok() }, S, good, 'path preserved')
await t('NEG ends on apex instead of canonical www', { [S]: to('https://clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good, 'canonical host')
await t('NEG off-domain redirect', { [S]: to('https://evil.example/en/pricing/?a=1&b=two') }, S, good, 'off-domain')
await t('NEG off-domain in the middle of a chain', { [S]: to('https://www.clinicalpsm.com/x'), 'https://www.clinicalpsm.com/x': to('https://evil.example/') }, S, good, 'off-domain')
await t('NEG redirect loop', { [S]: to('https://www.clinicalpsm.com/a'), 'https://www.clinicalpsm.com/a': to('http://clinicalpsm.com/en/pricing/?a=1&b=two') }, S, good, 'loop')
await t('NEG chain too long', { [S]: to('http://clinicalpsm.com/1'), 'http://clinicalpsm.com/1': to('http://clinicalpsm.com/2'), 'http://clinicalpsm.com/2': to('http://clinicalpsm.com/3'), 'http://clinicalpsm.com/3': to('http://clinicalpsm.com/4'), 'http://clinicalpsm.com/4': to('http://clinicalpsm.com/5'), 'http://clinicalpsm.com/5': to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, good, 'bounded')
await t('NEG final response is 404', { [S]: to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok(404) }, S, good, 'final response')
await t('NEG final response is 500', { [S]: to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two'), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok(500) }, S, good, 'final response')
await t('NEG redirect without Location', { [S]: { status: 301, location: null } }, S, good, 'Location')
await t('NEG permanent mode rejects a 302', { [S]: to('https://www.clinicalpsm.com/en/pricing/?a=1&b=two', 302), 'https://www.clinicalpsm.com/en/pricing/?a=1&b=two': ok() }, S, { ...good, permanent: true }, 'permanent')
await t('NEG unknown URL answers 404', { }, S, good, 'final response')
{ // thrown fetch error
  const res = evaluate(await walk(S, async () => { throw Object.assign(new Error('x'), { cause: { code: 'CERT_HAS_EXPIRED' } }) }), good)
  const p = res.some(r => r.id === 'no fetch/TLS error' && !r.ok && /CERT_HAS_EXPIRED/.test(r.detail)); results.push(p); console.log(`${p ? 'PASS' : 'FAIL'}  NEG TLS failure surfaces the error code`)
}
// open-redirect probes
const P = 'https://clinicalpsm.com//evil.example/'
await t('probe: stays on allowed hosts', { [P]: to('https://www.clinicalpsm.com//evil.example/'), 'https://www.clinicalpsm.com//evil.example/': ok(404) }, P, { allowed, probe: true })
await t('NEG probe: open redirect via //evil', { [P]: to('//evil.example/') }, P, { allowed, probe: true }, 'off-domain')
await t('NEG probe: open redirect via ?next=', { 'https://clinicalpsm.com/?next=https://evil.example': to('https://evil.example') }, 'https://clinicalpsm.com/?next=https://evil.example', { allowed, probe: true }, 'off-domain')
// case list covers http+https for both hosts
const cs = cases(A, W).map(c => c.start)
const cover = [`http://${A}`, `https://${A}`, `http://${W}`, `https://${W}`].every(p => cs.some(s => s.startsWith(p)))
results.push(cover); console.log(`${cover ? 'PASS' : 'FAIL'}  live case list covers http and https for apex and www`)

const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
