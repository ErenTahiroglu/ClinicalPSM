// CI configuration verification: workflows must pin actions to commit SHAs, declare least-privilege permissions,
// avoid pull_request_target and curl|sh, and never reference third-party LLM/API secrets.
import { readdirSync, readFileSync } from 'node:fs'
const dir = '.github/workflows'
let bad = 0
const fail = m => { console.error('FAIL ' + m); bad++ }
for (const f of readdirSync(dir).filter(f => /\.ya?ml$/.test(f))) {
  const t = readFileSync(`${dir}/${f}`, 'utf8')
  for (const m of t.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
    const ref = m[1]
    if (ref.startsWith('./')) continue
    if (!/@[0-9a-f]{40}(\s|$)/.test(ref + ' ')) fail(`${f}: action not pinned to a commit SHA: ${ref}`)
  }
  if (!/^permissions:/m.test(t)) fail(`${f}: no top-level permissions block`)
  if (/permissions:\s*write-all/.test(t)) fail(`${f}: write-all permissions`)
  if (/pull_request_target/.test(t)) fail(`${f}: pull_request_target is not allowed`)
  if (/curl[^\n|]*\|\s*(ba)?sh/.test(t)) fail(`${f}: curl | sh`)
  if (/(OPENAI|ANTHROPIC|GEMINI|MOONSHOT|DEEPSEEK)_API_KEY/.test(t)) fail(`${f}: references an LLM API key`)
  if (/upload-artifact/.test(t) && /gitleaks/i.test(t)) fail(`${f}: uploads artifacts in a workflow that runs gitleaks (reports may contain findings)`)
  console.log(`checked ${f}`)
}
console.log(bad ? `CI config: FAIL (${bad})` : 'CI config: OK')
process.exit(bad ? 1 : 0)
