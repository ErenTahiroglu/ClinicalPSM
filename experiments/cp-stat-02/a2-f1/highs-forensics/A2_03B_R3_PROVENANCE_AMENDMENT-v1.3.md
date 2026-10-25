# A2-03B R3 Python Provenance Amendment v1.3

**Status:** Local engineering amendment proposed for independent Red Team review; not approved for commit, CI, or numerical execution.

**Scope:** Clarify and measure Python acquisition provenance, preserve preflight evidence, and provide a separately invocable no-solver preflight path. This does not amend a scientific hypothesis, fixture, mathematical classification, LP, solver setting, acceptance criterion, or execution allowance.

## Frozen identities and execution history

- Immutable A2-03A preregistration commit: `44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe`.
- Original A2-03B v1.1 frozen lock SHA-256: `3286eed9b144d62d7b1c8ae6fe8b33c49b1722a4499c35a609a75e8de844b611`.
- Accepted R2 v1.2 frozen lock SHA-256: `50bdff5679543f089372673e30e9dd22071209b578e5462f184d194d3f86447b`.
- Original workflow SHA-256: `4d533dfa44d2c423a86466cabd00143a625103199a5fbaa08959d87bc9e564b5`.
- Accepted R1-repaired workflow SHA-256: `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9`; Git blob `dd8117178546e8d4dbe33e14e042c2a057470ecf`.
- Proposed R3 workflow SHA-256: `788c2ea2cfe300a8b0c17a0ae83fe18c1c368eae9b667baf863bf225fd4b0dd3`.
- Accepted R2 harness SHA-256: `18ffe93692f98522ef046287fd1b01fa0ce4b24e1653d4c5b2258aafd9f3a30b`.
- Proposed R3 harness SHA-256: `7e273275f8b5519e6f08ac8e74d0e5d193761694088c64046d2b7236cc7e4246`.
- Proposed v1.3 frozen-lock SHA-256: `d63147ce583dc9f636756276e3f5fe7c94fce35b22e3e7627b20106db7581d71`.

The blocked CI sequence is preserved as three separate infrastructure records:

1. Run `40121998475`: `actions/checkout` removed staging created before checkout. The locked pip report destination then failed because `.a2-03b/` did not exist. Summary backticks were also evaluated as shell command substitutions.
2. Run `40132953044`: the accepted R1 workflow repair ran, but v1.1 still expected the original workflow hash. Frozen-file validation rejected the repaired workflow before any LP call.
3. Run `40136417190`, job `120998774906`, artifact `12577410355`: v1.2 frozen verification and locked-wheel installation passed. `verify_python_build_manifest()` then rejected the empty `steps.python.outputs.cache-hit` value. The action log records that 3.13.17 was absent from the runner toolcache and the pinned release asset was downloaded. No LP was invoked.

For run `40136417190`, the independent artifact SHA-256 is `fe8c2abe7d33a75d297de9791796878c8201d3b30451217b44263a6cdd1f45b5`; its three checksum-listed payloads were verified. The run recorded 0/32 LP calls, 0/15 CI falsification controls, and no new numerical observations. Its fail-closed rejection was correct; this amendment does not recast it as scientific evidence.

## Provenance interpretation

The exact pinned `actions/setup-python` action is commit `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0`. Its `cache` input configures pip/pipenv/poetry dependency caching. Its `cache-hit` output reports a dependency-cache hit. The setup code resolves CPython first, then invokes dependency caching only when the `cache` input is configured. The workflow does not configure that input. Therefore an absent `cache-hit` is expected and is not evidence that Python was downloaded; `true` or `false` is not evidence of interpreter toolcache presence either.

The pinned Python release manifest identifies version, platform, filename, and download URL. The v1.2 lock's `python_source_archive_sha256` is the upstream CPython source archive hash; it is not the SHA-256 of the prebuilt `actions/python-versions` asset. The pinned manifest and setup-python outputs do not expose a digest for that prebuilt archive. The R3 proposal records this limitation explicitly. It does not claim the prebuilt archive bytes were independently hashed.

The proposed evidence separates:

- Pre-setup toolcache state: a read-only snapshot of the exact `Python/3.13.17/x64` slot, its `.complete` marker, executable path, size, and SHA-256.
- Action selection: the pinned action's `tool-cache find` then install-on-miss behavior, with its exact release-manifest commit and selected release URL.
- Post-setup process identity: CPython version/build, standard-GIL ABI, resolved `sys.executable`, setup-python `python-version`/`python-path` outputs, executable size and SHA-256, and runner image identity.
- Dependency cache: `NOT_APPLICABLE` for the frozen workflow because the optional package-cache input is absent. If enabled in a separately amended design, its hit/miss is recorded only as dependency-cache status.
- Prebuilt release-asset digest: `UNVERIFIED / NOT EXPOSED` by the pinned manifest and action interface. The recorded release URL and executable identity do not equal a cryptographic hash of the downloaded archive.

For a pre-existing complete toolcache slot, R3 requires the pre-setup executable identity to match the post-setup executable identity. For an absent slot, the exact version/architecture path, pinned setup-python implementation, and selected manifest URL support a derived download-branch interpretation. The final evidence keeps the branch label qualified as derived from these inputs; it does not call the package-cache output interpreter provenance.

This is the narrow pre-result measurement interpretation proposed for Red Team approval. If the existing scientific environment requirement is interpreted to require an independently verified SHA-256 of the prebuilt release archive itself, the current pinned action does not provide that evidence and a further separately approved measurement mechanism is required before execution.

## Proposed v1.3 frozen-lock delta

The original v1.1 and accepted v1.2 lock files remain unchanged. The proposed v1.3 lock is mechanically derived from v1.2. Recursive comparison found only:

| Field | v1.2 | Proposed v1.3 | Reason |
|---|---|---|---|
| `schema` | `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.2` | `CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.3` | Versioned engineering provenance amendment. |
| `files_sha256[.github/workflows/experiment-cp-stat-02-a2-03b.yml]` | `d776141d836f5065bdd7b14d4e0cd750018d1a7cdd09abd900f6f5071fce15c9` | `788c2ea2cfe300a8b0c17a0ae83fe18c1c368eae9b667baf863bf225fd4b0dd3` | Workflow now captures pre-setup toolcache state, passes its receipt, and describes that setup blocker accurately. |
| `files_sha256[experiments/cp-stat-02/a2-f1/highs-forensics/a2_03b_harness.py]` | `18ffe93692f98522ef046287fd1b01fa0ce4b24e1653d4c5b2258aafd9f3a30b` | `7e273275f8b5519e6f08ac8e74d0e5d193761694088c64046d2b7236cc7e4246` | Harness fixes provenance interpretation, records partial evidence, and adds a no-solver preflight path. |
| `python_provenance` | absent | Exact action SHA, snapshot schema/method, cache semantics, source-versus-prebuilt-hash distinction, installed binary identity requirements, and acquisition classes | Additive measurement metadata only. |

The v1.3 lock does not hash itself. It continues to hash the repaired workflow and the harness that verifies the lock. Its original source archive, matrix, proof, wheel, Python/NumPy/SciPy/HiGHS, manifest, tolerance, and 32-call values are preserved byte-for-byte from v1.2.

## Evidence-preservation changes

Before any frozen-file, environment, archive, or control check, the harness now:

1. Records a SHA-256 and byte count for the pip installation report.
2. Retains its exact bytes in evidence only when its structure contains no credential-like fields or authorization/bearer material and every URL conforms to the public PyPI wheel CDN, expected package/version filename, and non-secret wheel path structure. URL user information, nonstandard origins/paths, and signed/query URLs are rejected. A report that cannot be safely retained is represented by an explicit receipt and causes a fail-closed preflight blocker; its contents are not uploaded.
3. Writes a partial runtime receipt before later provenance checks can fail. It identifies the observation role and includes available interpreter path/hash/size/build/ABI and runner image fields without calling them a verified environment.
4. Redacts GitHub tokens and signed URL query strings from recorded exception text and logs.
5. Verifies the emitted `SHA256SUMS` manifest against the exact evidence file set before completion.

These additions do not convert a failed validation into a pass. Blocker recording keeps its nonzero result, and evidence upload remains under `if: always()` with missing files treated as an error.

## Scientific and execution invariants

No scientific input or outcome was changed. The following remain the original frozen values:

- Exactly 32 ordered cells: fixtures 31/33 × raw/column-max normalized × `highs-ds`/`highs-ipm` × complete-margin A/weak-margin B × two fresh-process repeats.
- Original LP objectives, constraints, bounds, solver options, feasibility/optimality tolerances, result diagnostics, exact-rational certificate rules, and reporting thresholds.
- Original 15 F-01 through F-15 definitions and their categories.
- Original A1 archive `ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a`, embedded archive identity, 160 member checksum set, matrix hashes, and accepted exact proofs.
- A1 remains 48 PASS / 2 FAIL; the general detector remains `NOT_QUALIFIED`. Fixture 31 remains mathematically COMPLETE; fixture 33 remains mathematically OVERLAP. The historical numerical causes remain unresolved.
- The pinned Python, NumPy, SciPy, embedded HiGHS, action commits, wheel hashes, and locked requirements remain unchanged.

AST comparison of the proposed harness against the accepted R2 harness found changes only in frozen-file validation, Python provenance/environment reporting, pip report handling, checksum verification, blocker handling, preflight orchestration, and CLI dispatch. LP construction, solver invocation, residual, exact-witness, repeatability, scientific interpretation, and falsification-control definitions are unchanged. The only workflow edits are provenance snapshot ordering/arguments and the blocker text. Workflow branches and path filters are unchanged.

## Local evidence and limitations

The proposed v1.3 verifier checked all 12 file identities. The R2 v1.2-to-R3 comparison found only the four rows above. Synthetic provenance cases tested disabled dependency caching, enabled cache hit/miss, both interpreter acquisition branches, missing/contradictory executable identity, invalid release URL, incorrect runner image/architecture, signed-query and non-PyPI/path-shaped pip URLs, bad wheel receipt, and missing frozen files/hashes. The local `self-test --require-frozen` against the immutable archive verified all 160 members, all 32 manifest rows, and 15 local synthetic controls with zero solver calls.

Those are offline engineering checks on the local helper runtime. They do not establish the pinned Ubuntu runner, CPython distribution binary integrity, hash-locked wheel installation on GitHub, embedded HiGHS runtime, or any numerical result. The no-solver preflight CI proposed separately in `A2_03B_R3_NO_SOLVER_PREFLIGHT_DESIGN-v1.md` has not been created or run.

## Stop and approval requirement

All proposed files are local and uncommitted. No workflow was dispatched, no CI run was started, no dependency was installed, and no solver was invoked. The current experiment workflow still automatically triggers on pushes to `development` that touch its existing `A2_03B_*` or harness path filters. Do not push this patch. Independent Red Team review must approve the provenance interpretation, the v1.3 lock, and a trigger-safe plan before any commit. A real preflight-only CI run and any future 32-call experiment each require their own separate explicit authorization.
