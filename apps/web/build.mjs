// Generates public/ (static HTML for EN/TR, CSS, JS, the bundled PSM Web Worker, _headers). No framework, no CDN.
import { build } from 'esbuild'
import { mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// ---- release configuration (env). --production fails closed when operator identity is missing ----
const PROD = process.argv.includes('--production')
const env = k => (process.env[k] ?? '').trim()
const CONTACT = env('CONTACT_EMAIL'), OPERATOR = env('OPERATOR_NAME'), HOST = env('CANONICAL_HOST')
const INDEXABLE = PROD && env('INDEXABLE') === '1'
const HSTS = env('HSTS_MAX_AGE')
if (PROD) {
  const bad = []
  if (!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(CONTACT)) bad.push('CONTACT_EMAIL')
  if (OPERATOR.length < 2 || /[\[\]<>]/.test(OPERATOR)) bad.push('OPERATOR_NAME')
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(HOST)) bad.push('CANONICAL_HOST')
  if (HSTS && !/^\d{1,9}$/.test(HSTS)) bad.push('HSTS_MAX_AGE')
  if (env('INDEXABLE') && !['0', '1'].includes(env('INDEXABLE'))) bad.push('INDEXABLE')
  if (bad.length) { console.error('production build refused; missing/invalid: ' + bad.join(', ')); process.exit(1) }
}

const C = JSON.parse(readFileSync('src/content.json', 'utf8'))
const OUT = 'public'
rmSync(OUT, { recursive: true, force: true })
const w = (p, s) => { mkdirSync(dirname(join(OUT, p)), { recursive: true }); writeFileSync(join(OUT, p), s) }
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// ---- engine worker: bundles the repository's current PSM worker unmodified ----
await build({ entryPoints: ['../../src/lib/psm/worker.ts'], bundle: true, format: 'iife', minify: true, outfile: join(OUT, 'assets/psm-worker.js'), target: 'es2022', logLevel: 'warning' })
copyFileSync('src/style.css', (mkdirSync(join(OUT, 'assets'), { recursive: true }), join(OUT, 'assets/style.css')))
copyFileSync('src/demo.js', join(OUT, 'assets/demo.js'))
copyFileSync('src/lang.js', join(OUT, 'assets/lang.js'))

const pages = ['', 'demo', 'pricing', 'limits', 'privacy']
const path = (lang, p) => `/${lang}/${p ? p + '/' : ''}`

function layout(lang, page, title, body, extraScript = '') {
  const t = C[lang], o = C[t.otherLang]
  const nav = pages.map(p => {
    const key = p === '' ? 'home' : p
    const cur = p === page ? ' aria-current="page"' : ''
    return `<li><a href="${path(lang, p)}"${cur}>${esc(t.nav[key])}</a></li>`
  }).join('')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(t.name)}</title>
<meta name="description" content="${esc(t.home.lead)}">
${INDEXABLE ? `<link rel="canonical" href="https://${HOST}${path(lang, page)}">` : '<meta name="robots" content="noindex">'}
<link rel="alternate" hreflang="${t.otherLang}" href="${path(t.otherLang, page)}">
<link rel="stylesheet" href="/assets/style.css">
</head>
<body>
<a class="skip" href="#main">${esc(t.skip)}</a>
<header><div class="top"><span class="brand">${esc(t.name)}</span>
<nav aria-label="${esc(t.navLabel)}"><ul>${nav}</ul></nav>
<a href="${path(t.otherLang, page)}" hreflang="${t.otherLang}" lang="${t.otherLang}" aria-label="${esc(t.langLabel)}: ${esc(t.otherLabel)}">${esc(t.otherLabel)}</a></div>
<p class="banner" role="note">${esc(t.banner)}</p></header>
<main id="main" tabindex="-1">
${body}
</main>
<footer><p>${esc(t.footer)}</p><p>${esc(t.operator)}: ${esc(OPERATOR || t.placeholderOp)} · ${esc(t.contact)}: ${CONTACT ? `<a href="mailto:${esc(CONTACT)}">${esc(CONTACT)}</a>` : esc(t.placeholderContact)} · <a href="${path(lang, 'privacy')}">${esc(t.privacyNav)}</a></p></footer>
${extraScript}
</body>
</html>
`
}

for (const lang of ['en', 'tr']) {
  const t = C[lang]
  w(`${lang}/index.html`, layout(lang, '', t.home.title, `
<h1>${esc(t.home.title)}</h1><p class="lead">${esc(t.home.lead)}</p>
<div class="grid">
<section class="card" aria-labelledby="a1"><h2 id="a1">${esc(t.home.s1t)}</h2><p>${esc(t.home.s1)}</p></section>
<section class="card" aria-labelledby="a2"><h2 id="a2">${esc(t.home.s2t)}</h2><p>${esc(t.home.s2)}</p></section>
<section class="card" aria-labelledby="a3"><h2 id="a3">${esc(t.home.s3t)}</h2><p>${esc(t.home.s3)}</p></section></div>
<p><a class="btn" href="${path(lang, 'demo')}">${esc(t.home.cta)}</a> <a class="btn secondary" href="${path(lang, 'limits')}">${esc(t.home.cta2)}</a></p>`))

  const d = t.demo
  const i18n = JSON.stringify({ summary: d.summary, treated: d.treated, control: d.control, matched: d.matched, smdB: d.smdB, smdA: d.smdA, tbl: d.tbl, cov: d.cov, before: d.before, after: d.after, note: d.note, err: d.err, run: d.run, running: d.running, status: d.status }).replace(/</g, '\\u003c')
  w(`${lang}/demo/index.html`, layout(lang, 'demo', d.title, `
<h1>${esc(d.title)}</h1><p class="banner warnline" role="alert">${esc(d.warn)}</p><p>${esc(d.intro)}</p>
<p><button id="run" class="btn" type="button">${esc(d.run)}</button></p>
<p id="status" role="status" aria-live="polite" class="sr"></p>
<div id="out" aria-live="polite"></div>
<script type="application/json" id="i18n">${i18n}</script>`, '<script src="/assets/demo.js" defer></script>'))

  const p = t.pricing
  const plan = (k, d2) => `<section class="card" aria-labelledby="p-${k}"><h2 id="p-${k}">${esc(p[k])}</h2><p>${esc(d2)}</p><p><em>${esc(p.planned)}</em></p><button class="btn" type="button" disabled aria-disabled="true">${esc(p.button)}</button></section>`
  w(`${lang}/pricing/index.html`, layout(lang, 'pricing', p.title, `
<h1>${esc(p.title)}</h1><p class="banner" role="note">${esc(p.notice)}</p>
<div class="grid">${plan('free', p.freeD)}${plan('plus', p.plusD)}${plan('pro', p.proD)}</div>`))

  const l = t.limits
  w(`${lang}/limits/index.html`, layout(lang, 'limits', l.title, `
<h1>${esc(l.title)}</h1><p>${esc(l.p1)}</p>
<div class="table-wrap"><table><caption>${esc(l.title)}</caption><thead><tr>${l.th.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${l.rows.map(r => `<tr><th scope="row">${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('')}</tbody></table></div>`))

  const v = t.privacy
  const ul = a => `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`
  w(`${lang}/privacy/index.html`, layout(lang, 'privacy', v.title, `
<h1>${esc(v.title)}</h1><p class="lead">${esc(v.p0)}</p>
<h2>${esc(v.h1)}</h2>${ul(v.l1)}<h2>${esc(v.h2)}</h2>${ul(v.l2)}
<h2>${esc(v.h3)}</h2><p>${esc(v.p3)}</p><p>${esc(t.operator)}: ${esc(OPERATOR || t.placeholderOp)}<br>${esc(t.contact)}: ${esc(CONTACT || t.placeholderContact)}</p>
<h2>${esc(v.h4)}</h2><p>${esc(v.p4)}</p>`))
}

// root: language chooser (works without JavaScript)
w('index.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ClinicalPSM</title>${INDEXABLE ? `<link rel="canonical" href="https://${HOST}/">` : '<meta name="robots" content="noindex">'}
<link rel="stylesheet" href="/assets/style.css"></head>
<body><main id="main" style="max-width:40rem;margin:3rem auto;padding:0 1rem"><h1>ClinicalPSM</h1>
<p>Research preview · Araştırma önizlemesi</p>
<p><a class="btn" href="/en/" hreflang="en" lang="en">English</a> <a class="btn" href="/tr/" hreflang="tr" lang="tr">Türkçe</a></p></main>
<script src="/assets/lang.js" defer></script></body></html>
`)
w('404.html', `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 · ClinicalPSM</title><meta name="robots" content="noindex"><link rel="stylesheet" href="/assets/style.css"></head><body><main style="max-width:40rem;margin:3rem auto;padding:0 1rem"><h1>404</h1><p lang="en">Page not found. <a href="/en/">English home</a></p><p lang="tr">Sayfa bulunamadı. <a href="/tr/">Türkçe ana sayfa</a></p></main></body></html>
`)
if (INDEXABLE) {
  w('robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${HOST}/sitemap.xml\n`)
  const urls = [`https://${HOST}/`, ...['en', 'tr'].flatMap(l => pages.map(p => `https://${HOST}${path(l, p)}`))]
  w('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${u}</loc></url>`).join('\n')}\n</urlset>\n`)
} else w('robots.txt', 'User-agent: *\nAllow: /\n') // crawl allowed on purpose: a Disallow would hide the noindex directive from crawlers
if (PROD) {
  const exp = new Date(Date.now() + 300 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z')
  w('.well-known/security.txt', `Contact: mailto:${CONTACT}\nExpires: ${exp}\nPreferred-Languages: en, tr\nCanonical: https://${HOST}/.well-known/security.txt\n`)
}
w('_headers', `/*
${INDEXABLE ? '' : '  X-Robots-Tag: noindex, nofollow\n'}  Content-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'none'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Resource-Policy: same-origin
${PROD && HSTS && HSTS !== '0' ? `  Strict-Transport-Security: max-age=${HSTS}\n` : ''}/assets/*
  Cache-Control: public, max-age=3600
`)
console.log(`built public/ (${PROD ? 'production' : 'preview'}${INDEXABLE ? ', indexable' : ''})`)
