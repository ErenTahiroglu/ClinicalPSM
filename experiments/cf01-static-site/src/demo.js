// Synthetic-only demo. No file input exists on this site; data are generated here from a fixed seed.
const btn = document.getElementById('run')
const out = document.getElementById('out')
const status = document.getElementById('status')
const T = JSON.parse(document.getElementById('i18n').textContent)

function cohort() {
  let seed = 7
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
  return Array.from({ length: 200 }, () => {
    const age = Math.round(40 + rnd() * 40), bmi = +(20 + rnd() * 15).toFixed(1)
    const p = 1 / (1 + Math.exp(-((age - 60) / 10 + (bmi - 27) / 5)))
    return { age, bmi, sex: rnd() < 0.5 ? 'F' : 'M', treated: rnd() < p ? 1 : 0 }
  })
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const fmt = n => (Number.isFinite(n) ? n.toFixed(3) : '–')
function render(r) {
  const rows = r.balanceTable.map(b => `<tr><th scope="row">${esc(b.covariate)}</th><td>${fmt(b.smdBefore)}</td><td>${fmt(b.smdAfter)}</td></tr>`).join('')
  out.innerHTML = `<h3>${T.summary}</h3><div class="grid">
    <div class="card"><strong>${r.nTreated}</strong><br>${T.treated}</div><div class="card"><strong>${r.nControl}</strong><br>${T.control}</div>
    <div class="card"><strong>${r.nMatched}</strong><br>${T.matched}</div><div class="card"><strong>${fmt(r.overallSmdBefore)}</strong><br>${T.smdB}</div>
    <div class="card"><strong>${fmt(r.overallSmdAfter)}</strong><br>${T.smdA}</div></div>
    <div class="table-wrap"><table><caption>${T.tbl}</caption><thead><tr><th scope="col">${T.cov}</th><th scope="col">${T.before}</th><th scope="col">${T.after}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p>${T.note}</p>`
}
btn.addEventListener('click', () => {
  btn.disabled = true; btn.textContent = T.running; status.textContent = T.running
  let worker
  try { worker = new Worker('/assets/psm-worker.js') } catch { out.textContent = T.err; btn.disabled = false; btn.textContent = T.run; return }
  const timer = setTimeout(() => { worker.terminate(); out.textContent = T.err; btn.disabled = false; btn.textContent = T.run }, 20000)
  worker.onmessage = e => {
    clearTimeout(timer); worker.terminate(); btn.disabled = false; btn.textContent = T.run
    if (e.data.type === 'result') { render(e.data.payload); status.textContent = T.status + ': OK' } else { out.textContent = T.err; status.textContent = T.err }
  }
  worker.onerror = () => { clearTimeout(timer); out.textContent = T.err; btn.disabled = false; btn.textContent = T.run }
  worker.postMessage({ rawData: cohort(), config: { treatmentColumn: 'treated', covariates: ['age', 'bmi', 'sex'], ratio: 1, caliper: null, withReplacement: false } })
})
