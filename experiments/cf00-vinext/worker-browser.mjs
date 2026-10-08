// Runs the emitted PSM Web Worker chunk from the vinext build inside a real Chromium-based browser
// served by the vinext/workerd preview. Synthetic data only. Usage: node worker-browser.mjs http://localhost:4173
import { chromium } from '@playwright/test'
import { readdirSync } from 'node:fs'

const base = process.argv[2] ?? 'http://localhost:4173'
const dir = new URL('../../dist/client/_next/static/workers/', import.meta.url)
const file = readdirSync(dir).find(f => f.endsWith('.js'))
if (!file) throw new Error('worker chunk not found in build output')

// deterministic synthetic cohort (no real data)
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
const rows = Array.from({ length: 200 }, (_, i) => {
  const age = Math.round(40 + rnd() * 40)
  const bmi = +(20 + rnd() * 15).toFixed(1)
  const p = 1 / (1 + Math.exp(-((age - 60) / 10 + (bmi - 27) / 5)))
  return { age, bmi, sex: rnd() < 0.5 ? 'F' : 'M', treated: rnd() < p ? 1 : 0 }
})
const config = { treatmentColumn: 'treated', covariates: ['age', 'bmi', 'sex'], ratio: 1, caliper: null, withReplacement: false }

const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })
const page = await browser.newPage()
const cspViolations = []
page.on('console', m => { if (/Content Security Policy/i.test(m.text())) cspViolations.push(m.text()) })
await page.goto(`${base}/en`)
const out = await page.evaluate(async ({ url, rows, config }) => {
  const t0 = performance.now()
  return await new Promise((resolve) => {
    const w = new Worker(url, { type: 'module' })
    const to = setTimeout(() => resolve({ type: 'timeout' }), 20000)
    w.onmessage = e => { clearTimeout(to); resolve({ type: e.data.type, ms: performance.now() - t0, keys: Object.keys(e.data.payload ?? {}), nMatched: e.data.payload?.nMatched, nTreated: e.data.payload?.nTreated, code: e.data.payload?.code }) }
    w.onerror = e => { clearTimeout(to); resolve({ type: 'onerror', message: String(e.message) }) }
    w.postMessage({ rawData: rows, config })
  })
}, { url: `/_next/static/workers/${file}`, rows, config })
console.log(JSON.stringify({ workerFile: file, cspViolations: cspViolations.length, result: out }, null, 2))
await browser.close()
process.exit(out.type === 'result' && cspViolations.length === 0 ? 0 : 1)
