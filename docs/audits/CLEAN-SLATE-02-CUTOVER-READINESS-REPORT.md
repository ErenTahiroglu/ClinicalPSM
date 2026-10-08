# CLEAN-SLATE-02 report: cutover readiness and GitHub security integration

Baseline `6972c9c79a371d85502c4123d726273889928d19` (`phase/clean-slate-01-staging`). Working branch `phase/clean-slate-02-cutover-readiness`. Red Team decision on CLEAN-SLATE-01: `STAGING_PASS_WITH_FINDINGS`. **Production cutover is not authorized.** No DNS change, no production deployment, no deletion of any resource, no merge. LOCAL = this machine; LIVE = staging URL.

## 1. Red Team findings fixed

| Finding | Fix | Evidence |
|---|---|---|
| A. HTTPS enforcement was INFO | Plain-HTTP that is not upgraded is now **FAIL**, for apex and `www`, with path and query | `scripts/devtools/cutover-redirects.mjs`, wired into `verify-cutover.sh --post` |
| B. Single-redirect assumption | Replaced by a chain evaluator: bounded (≤ 4 redirects), no loop, every hop on the apex/www pair only, final scheme https, final host `www.clinicalpsm.com`, path preserved, query preserved, final status 200, redirect status in 301/302/307/308 (301/308 only with `REQUIRE_PERMANENT=1`), fetch/TLS errors reported | 24 synthetic chains PASS (below) |
| C. Privacy wording | Home copy no longer says "Nothing you do here is sent to a server" or "never sent to a server". It now says processing is local **by design**, that opening pages involves ordinary web requests processed by Cloudflare, and that the demo makes no requests of its own while it runs. Footer points to the Privacy notice. EN and TR | `production-build` test rejects the old claims and requires the Cloudflare acknowledgement on home and privacy in both languages |

### Redirect and HTTPS test results

| Test | Result |
|---|---|
| `cutover-redirects.test.mjs` (LOCAL, injected fake fetch, no network) | **24/24 PASS**. Positive: 2-hop (Always Use HTTPS), 1-hop, 3-hop, permanent mode, direct www. Negative, each detected: http never upgraded, upgraded only to http, query dropped, path dropped, ends on apex, off-domain final, off-domain mid-chain, loop, 6-hop chain, final 404, final 500, redirect without Location, 302 under permanent mode, TLS error surfaced with its code, open redirect via `//evil` and via `?next=` |
| Live runner against staging (LIVE, read-only) with apex=www=staging host | http cases **FAIL as designed** (workers.dev answers 200 on plain http, so there is no upgrade); https cases PASS; all 10 open-redirect probes PASS. This proves the detector fires on a real server |
| Real `clinicalpsm.com` | **NOT_RUN**: no redirect rule exists; the zone is unchanged |

## 2. Gate and CI results

| Check | Result |
|---|---|
| `tsc`, `lint`, unit tests, root build | PASS (gate matrix BASE 10/10) |
| CF-01 gates | 5/5 PASS |
| CS-00 gates (static build, browser, production-build, free-compat, verifier self-test) | 5/5 PASS |
| New CS-02 gate `cs02.redirect-chain-tests` | PASS; added to `gates.json`, to `gates.yml`; `GATE_PHASE=CS-02` |
| `apps/web` production-build tests | **20/20** (was 18; +2 privacy-wording checks) |
| Browser + axe, local | 87/87; LIVE on refreshed staging 87/87 |
| `test/live.mjs` on refreshed staging | LIVE 37/37 (headers, noindex, 29 hidden paths 404, open-redirect probes, byte-identity) |
| `verify-cutover.sh --selftest` | OK, includes the 24 redirect tests |
| `verify-ci.mjs` | OK |
| Gitleaks | history PASS, current tree PASS, selftest PASS; staged scan before commit (see git log) |
| Graphify | 1102 nodes, 2210 edges |
| Codebase Memory | 2614 nodes, 5259 edges. **Provenance WARN open**: installed 0.11.0 binary sha256 differs from the verified release asset; not upgraded, not replaced; needs a maintenance window |
| GitHub Actions | recorded in the final message after push |

Staging was refreshed within the earlier temporary authorization (same Worker `cs01-staging-web-1008b`, new version `f5fb6c5c-166e-4cff-aa0d-43db8a909ee1`) so that it no longer shows the old categorical sentence. It was not deleted.

## 3. GitHub remediation integration

Facts (explicit ancestry, `git merge-base`, real merges in a throw-away worktree, since removed; no refs changed):

| Branch | Tip | Parent | vs `main` (`dfa475b`) | Content |
|---|---|---|---|---|
| `ci/sec-00-main-ci-node24` (PR0) | `2c1b405` | `dfa475b` | +1 / −0 | `ci.yml` Node 24 |
| `security/sec-00-untrack-vscode-main` (PR1) | `fe7f5e7` | `dfa475b` | +1 / −0 | deletes tracked `.vscode/settings.json`, ignore entries |
| `security/sec-00-untrack-vscode-cp00` (PR2) | `7067f7f` | `1bc924d` | +5 / −0 | same fix on the CP-00 line, plus migrations 010–012 for the deleted Supabase project |
| this chain (`HEAD`) | | | +14 / −0 vs main; none of the three is an ancestor of it | contains its own untrack commit `45c398b` |

Simulated merges:
- main + PR0: clean. main + PR1: clean. main + PR0 + PR1: clean. After PR0 and PR1, `.vscode/settings.json` is tracked in **0** files.
- (main + PR0 + PR1) + this chain: **one conflict, `.gitignore`**, two adjacent-line appends where the main side is empty in both hunks. Resolution is the plain union (`git checkout --theirs .gitignore`), leaving 0 duplicate lines. Resolved result: Node 24 in `ci.yml`, 0 tracked `.vscode` files, `verify-ci.mjs` OK, **`gitleaks.sh current` exit 0** on the merged tree.
- main + PR0 + this chain without PR1 also merges cleanly and also leaves 0 tracked `.vscode` files (the chain's own untrack commit does it); but that merge brings 149 files, including the legacy Supabase migrations, so it is not the smallest path.

**Smallest safe path (each a PR, CI green, Red Team approval first, no force-push, no rewrite):**
1. **PR0** CI Node 24: unblocks red `main`.
2. **PR1** untrack `.vscode`: `main` stops tracking the credential-bearing editor config. This is the item that closes the "main still tracks it" gap, and it is independent of everything else.
3. Re-run `bash scripts/devtools/gitleaks.sh current` on the merged `main` (expected exit 0, and it is the CI "Security (gitleaks)" job).
4. The clean-slate chain as one reviewed PR *after* the verdict; resolve the single `.gitignore` conflict as the union above. Decide at that review whether the CP-00 migrations (retired stack) should land or be dropped.
5. PR2 only if the Supabase line were ever revived. Not recommended.

The old credential remains in Git history (one redacted baseline finding); it was reset, belonged to a different, already-deleted project, and was neither printed nor reused. GitHub secret scanning and push protection are **still disabled**: owner settings action.

## 4. Cloudflare Free verification

Unchanged from CLEAN-SLATE-01 and still bounded: assets-only Worker (`bindings: []`), static asset requests need no Worker CPU, 18 files (limit 20,000), largest 5 KiB (limit 25 MiB), observability off, a Custom Domain on a Free zone already exists on this account (`erentahiroglu.com`). **Not verifiable with the token:** plan tier, `clinicalpsm.com` DNS/SSL/rulesets, whether the Custom Domain certificate shows a charge. These are checkpoints C1, C2, C7, C11 in the runbook, done by the owner.

## 5. Production-build prerequisites (owner-supplied, never invented)

| Input | Rule |
|---|---|
| `OPERATOR_NAME` | ≥ 2 chars, no brackets |
| `CONTACT_EMAIL` | valid address, public |
| `CANONICAL_HOST` | `www.clinicalpsm.com` |
| `INDEXABLE` | unset: build stays `noindex` with `X-Robots-Tag`. Needs a separate owner decision |
| `HSTS_MAX_AGE` | unset for the first release |

The build exits 1 without the first three (8 refusal cases tested). Local tests use `security@example.org`, `Example Operator`, `www.example.org`.

## 6. Remaining limitations

- Engine **UNVALIDATED**; no change to algorithms; no R MatchIt reference yet (CP-02/03). Demo is synthetic only; visible warnings kept.
- No upload, accounts, persistence, payments, analytics. Legal text is not counsel-reviewed.
- The apex redirect rule, Custom Domain, certificate and HTTPS enforcement on the real domain are untested until the owner performs C7–C10.
- `workers.dev` serves plain HTTP; only the custom domain with Always Use HTTPS is checked to redirect.
- Staging Worker and `cf01-throwaway-*` resources still exist (deletion needs separate authorization).
- GitHub secret scanning/push protection disabled.

## 7. Proposed verdict

**CUTOVER_READY_PENDING_OWNER_APPROVAL (PASS_WITH_FINDINGS candidate).** All preparation is done and tested locally and on staging; every remaining step is an owner-approved dashboard action with a written checkpoint.
