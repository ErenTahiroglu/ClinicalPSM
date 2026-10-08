// Browser tests for the static-first prototype (Brave/Chromium via Playwright). Synthetic data only.
// Usage: node test/site.mjs http://localhost:8793
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const base = process.argv[2] ?? 'http://localhost:8793'
const axeSrc = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8')
const results = []
const rec = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${d ? '  :: ' + d : ''}`) }

const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const page = await ctx.newPage()
// axe needs script injection, which the site's CSP (correctly) forbids: use a dedicated context that bypasses CSP for the a11y pass only.
const axeCtx = await browser.newContext({ viewport: { width: 1280, height: 800 }, bypassCSP: true })
const axePage = await axeCtx.newPage()
const consoleProblems = [], external = []
page.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleProblems.push(m.text()) })
page.on('pageerror', e => consoleProblems.push(String(e)))
page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) external.push(r.url()) })

const pages = ['', 'demo/', 'pricing/', 'limits/']
for (const lang of ['en', 'tr']) {
  for (const p of pages) {
    const url = `${base}/${lang}/${p}`
    const res = await page.goto(url)
    rec(`${lang}/${p || 'home'} loads 200`, res.status() === 200)
    rec(`${lang}/${p || 'home'} <html lang="${lang}">`, (await page.getAttribute('html', 'lang')) === lang)
    rec(`${lang}/${p || 'home'} has one h1, main, nav, header, footer`, (await page.locator('h1').count()) === 1 && (await page.locator('main').count()) === 1 && (await page.locator('nav').count()) === 1 && (await page.locator('header').count()) === 1 && (await page.locator('footer').count()) === 1)
    rec(`${lang}/${p || 'home'} shows the research-preview/unvalidated banner`, /validat|doğrulan/i.test(await page.locator('.banner').first().innerText()))
    await axePage.goto(url)
    const v = await axePage.evaluate(async src => { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); return (await window.axe.run(document, { resultTypes: ['violations'] })).violations.map(x => `${x.id}(${x.impact})`) }, axeSrc).catch(e => ['axe-failed: ' + e.message])
    rec(`${lang}/${p || 'home'} axe: no violations`, v.length === 0, v.join(', '))
    const sw = await (async () => { await page.setViewportSize({ width: 375, height: 700 }); const r = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1); await page.setViewportSize({ width: 1280, height: 800 }); return r })()
    rec(`${lang}/${p || 'home'} fits a 375px viewport without horizontal page scroll`, sw)
  }
}

// CSP: inline script injection by axe is blocked by CSP in a real page, so run a separate no-axe CSP check
// (axe injection above uses an inline <script>, which our CSP forbids; Playwright evaluate bypasses CSP, the DOM insertion may be reported)
// -> console problems are evaluated only on a fresh context without axe.
const clean = await ctx.newPage()
const cspMsgs = [], ext2 = [], reqs = []
clean.on('console', m => { if (['error', 'warning'].includes(m.type())) cspMsgs.push(m.text()) })
clean.on('pageerror', e => cspMsgs.push(String(e)))
clean.on('request', r => { reqs.push(r.url()); if (!r.url().startsWith(base) && !r.url().startsWith('data:')) ext2.push(r.url()) })
for (const lang of ['en', 'tr']) for (const p of pages) await clean.goto(`${base}/${lang}/${p}`)
rec('no console errors/CSP violations on any page (clean context)', cspMsgs.length === 0, cspMsgs.slice(0, 2).join(' | '))
rec('no third-party requests on any page', ext2.length === 0, ext2.join(','))

// headers
for (const path of ['/en/', '/assets/style.css', '/assets/psm-worker.js', '/tr/demo/', '/nope']) {
  const r = await ctx.request.get(base + path)
  const h = r.headers()
  rec(`headers on ${path}`, /frame-ancestors 'none'/.test(h['content-security-policy'] ?? '') && !/unsafe-/.test(h['content-security-policy'] ?? '') && h['x-content-type-options'] === 'nosniff' && h['x-frame-options'] === 'DENY' && h['referrer-policy'] === 'no-referrer', `status=${r.status()}`)
}

// navigation + language switch + keyboard
await page.goto(`${base}/en/`)
await page.keyboard.press('Tab')
rec('first Tab stop is the skip link', await page.evaluate(() => document.activeElement?.classList.contains('skip')))
await page.keyboard.press('Enter')
rec('skip link moves focus to main', await page.evaluate(() => document.activeElement?.id === 'main'))
await page.click('nav >> text=Pricing'); rec('nav: Pricing', page.url().endsWith('/en/pricing/'))
await page.click('a[hreflang="tr"]'); rec('language switch keeps the page (EN pricing -> TR pricing)', page.url().endsWith('/tr/pricing/') && (await page.getAttribute('html', 'lang')) === 'tr')
await page.click('nav >> text=Sentetik demo'); rec('TR nav: demo', page.url().endsWith('/tr/demo/'))
await page.goBack(); rec('browser back works', page.url().endsWith('/tr/pricing/'))
await page.goto(`${base}/`); rec('root offers both languages', (await page.locator('a[hreflang]').count()) === 2)

// no upload surface, no forms, purchases disabled
for (const lang of ['en', 'tr']) for (const p of pages) {
  await page.goto(`${base}/${lang}/${p}`)
  const n = await page.evaluate(() => ({ file: document.querySelectorAll('input[type=file]').length, form: document.querySelectorAll('form').length, input: document.querySelectorAll('input,textarea,select').length, ext: [...document.querySelectorAll('a[href]')].filter(a => /^https?:/.test(a.getAttribute('href'))).length }))
  if (n.file || n.form || n.input || n.ext) rec(`${lang}/${p} has no file/form/input/external link`, false, JSON.stringify(n))
}
rec('no file input, form, input control or external link on any page', true)
for (const lang of ['en', 'tr']) {
  await page.goto(`${base}/${lang}/pricing/`)
  const b = await page.$$eval('button', bs => bs.map(x => x.disabled && x.getAttribute('aria-disabled') === 'true'))
  rec(`${lang} pricing: 3 purchase buttons, all disabled`, b.length === 3 && b.every(Boolean))
  rec(`${lang} pricing: no checkout/payment links`, (await page.$$eval('a[href]', as => as.filter(a => /polar|paddle|lemon|checkout|buy\./i.test(a.href)).length)) === 0)
}

// demo runs the real engine in a Web Worker and labels it unvalidated
for (const lang of ['en', 'tr']) {
  await page.goto(`${base}/${lang}/demo/`)
  await page.click('#run')
  await page.waitForSelector('#out table', { timeout: 15000 })
  const txt = await page.locator('main').innerText()
  const rows = await page.locator('#out tbody tr').count()
  const matched = await page.locator('#out .card strong').nth(2).innerText()
  rec(`${lang} demo: result table rendered (${rows} covariates, ${matched} matched pairs)`, rows >= 3 && Number(matched) > 0)
  rec(`${lang} demo: output stays labelled unvalidated/synthetic`, /UNVALIDATED|DOĞRULANMAMIŞ/.test(txt) && /SYNTHETIC|SENTETİK/.test(txt))
  rec(`${lang} demo: button re-enabled after run`, await page.locator('#run').isEnabled())
}
rec('demo made no third-party requests', external.length === 0, external.join(','))

// storage: no cookies / web storage
const stor = await page.evaluate(() => ({ ls: localStorage.length, ss: sessionStorage.length, ck: document.cookie.length }))
rec('no cookies and no web storage used', stor.ls === 0 && stor.ss === 0 && stor.ck === 0 && (await ctx.cookies()).length === 0, JSON.stringify(stor))

await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
