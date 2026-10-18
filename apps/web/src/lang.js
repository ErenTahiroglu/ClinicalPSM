// Root page only: suggest a language from the browser setting (no network, no storage).
const l = (navigator.language || 'en').toLowerCase().startsWith('tr') ? 'tr' : 'en'
const a = document.querySelector(`a[hreflang="${l}"]`)
if (a) a.setAttribute('data-suggested', 'true')
