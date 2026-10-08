// Supply-chain inventory: lockfile present, every lock entry from the npm registry (no git/url/file sources), counts, install-script packages.
import { readFileSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const entries = Object.entries(lock.packages ?? {}).filter(([k]) => k !== '')
const nonRegistry = entries.filter(([, v]) => v.resolved && !/^https:\/\/registry\.npmjs\.org\//.test(v.resolved))
const noIntegrity = entries.filter(([, v]) => v.resolved && !v.integrity)
const scripts = entries.filter(([, v]) => v.hasInstallScript).map(([k]) => k.replace(/^.*node_modules\//, ''))
const declared = { ...pkg.dependencies, ...pkg.devDependencies }
const unlocked = Object.keys(declared).filter(d => !lock.packages?.[`node_modules/${d}`])
console.log(`declared: ${Object.keys(pkg.dependencies ?? {}).length} prod + ${Object.keys(pkg.devDependencies ?? {}).length} dev; lockfile packages: ${entries.length}; lockfileVersion ${lock.lockfileVersion}`)
console.log(`packages with install scripts (${scripts.length}): ${scripts.slice(0, 12).join(', ')}${scripts.length > 12 ? ', …' : ''}`)
let bad = 0
if (nonRegistry.length) { console.error(`FAIL non-registry sources: ${nonRegistry.map(([k]) => k).slice(0, 5).join(', ')}`); bad++ }
if (noIntegrity.length) { console.error(`FAIL entries without integrity hash: ${noIntegrity.length}`); bad++ }
if (unlocked.length) { console.error(`FAIL declared but not locked: ${unlocked.join(', ')}`); bad++ }
console.log(bad ? 'dependency inventory: FAIL' : 'dependency inventory: OK (all registry-sourced with integrity hashes)')
process.exit(bad ? 1 : 0)
