# Solver Environment Lock — Preregistered, Not Executed

**Lock:** `CP-STAT-02-A2-03A-HIGHS-ENV-v1`
**Purpose:** future A2-03B execution only. No SciPy or HiGHS binary was installed or run while preparing this lock.

## Platform

| Component | Locked value | Provenance/qualification |
| --- | --- | --- |
| CI host | GitHub-hosted `ubuntu-24.04`, Linux x86_64 | Record `ImageOS`, `ImageVersion`, kernel, glibc, and architecture from the actual run. GitHub-hosted image revisions are managed and may move under this label; no solver run is valid if these values are absent. |
| Python | CPython `3.13.17`, standard GIL build, CPython 3.13 ABI | Python 3.13.17 is the official 2026-10-21 security release. The CPython upstream source `Python-3.13.17.tar.xz` SHA-256 is `6020bd10aff3bf4821be16f088ebb1591beb7b811dcd8fab1da8f7c22a7b27e7`. This is the upstream source archive hash, **not** a hash of the prebuilt interpreter supplied by `actions/setup-python`. Record the installed binary identity and the setup-python download/cache provenance in the actual run evidence; if that cannot be recorded, stop before solving. |
| Checkout action | `actions/checkout` v7.0.1, commit `3d3c42e5aac5ba805825da76410c181273ba90b1` | Full commit pin; tag/commit resolved through the official GitHub repository on 2026-10-24. |
| Python setup action | `actions/setup-python` v7.1.0, commit `6d4fd22b20465ccc0f7354476588e8df7c9ca0e0` | Full commit pin; tag/commit resolved through the official GitHub repository on 2026-10-24. |

The Python source hash is recorded for provenance; the future run must separately capture `python -VV`, `sys.implementation`, ABI, executable path within the ephemeral runner, action version/commit, and image revision. The runner is one GitHub-hosted Linux x86_64 job. No matrix across operating systems or architectures is allowed in this bounded experiment.

## Python packages and artifact hashes

Install only these pinned runtime packages, with hashes enforced (`pip --require-hashes`). The selected wheel names match CPython 3.13 on x86_64 Linux and the Ubuntu 24.04 glibc baseline. The SHA-256 values are the published hashes in the official PyPI JSON metadata, read on 2026-10-24.

| Package | Exact pin | Artifact | SHA-256 | Role |
| --- | --- | --- | --- | --- |
| pip | `26.2.2` | `pip-26.2.2-py3-none-any.whl` | `fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70` | Installer, also embedded in official Python 3.13.17 release metadata |
| NumPy | `2.5.4` | `numpy-2.5.4-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` | `6ffa07666f8da0eef81d149934a626d0d95fbd6838432a33e66245423a9062c0` | Only declared SciPy runtime dependency; within SciPy's published `numpy>=2.0.0,<2.8` constraint |
| SciPy | `1.18.1` | `scipy-1.18.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl` | `fdaf5ea890a6183d0565f51a61799d67081bd5b1cf03c5f4b3fd3732108625c9` | `scipy.optimize.linprog` API and compiled HiGHS implementation |

SciPy release source identity is commit `e4e854eaa8f18d807cd3496028e257e36caa93cc` (release tag `v1.18.1`). At that exact source tree, the `subprojects/highs` gitlink is commit `4f96ee8f40b2d3a46e00d6137d5eb31044680776`; its commit message records the update to HiGHS v1.12.0. Therefore this experiment's underlying HiGHS pin is **the v1.12.0 implementation embedded in the hash-pinned SciPy 1.18.1 wheel**, not the newer standalone HiGHS release and not a separately installed `highspy` package.

The SciPy wheel hash pins the actual packaged binary bytes; the SciPy release commit and HiGHS gitlink pin the corresponding source identities. The future run must record these identities in its manifest and verify the installed versions before the first LP. It must fail preflight on a package/version/hash mismatch. No project-wide dependency lock or production package is changed.

## Binary/source URLs

- Python release page and source checksums: <https://www.python.org/downloads/release/python-31317/>
- SciPy 1.18.1 package artifact metadata: <https://pypi.org/pypi/scipy/1.18.1/json>
- NumPy 2.5.4 package artifact metadata: <https://pypi.org/pypi/numpy/2.5.4/json>
- SciPy 1.18.1 source tag: <https://github.com/scipy/scipy/tree/v1.18.1>
- HiGHS pinned subproject commit: <https://github.com/ERGO-Code/HiGHS/commit/4f96ee8f40b2d3a46e00d6137d5eb31044680776>
- SciPy `linprog` / HiGHS public API docs: <https://docs.scipy.org/doc/scipy/reference/optimize.linprog-highs.html>
- HiGHS project and solver overview: <https://highs.dev/>

## Solver behavior lock

The fixed method/options, raw and column-max input arms, 32-call ceiling, repeated-process plan, status mapping, residual policies, and non-convergence outcomes are defined in `NUMERICAL_ACCEPTANCE_CONTRACT.json`. No private SciPy or HiGHS option will be passed. Unexposed internal scaling/thread defaults are not claimed to be pinned; the exact released binary, public options, actual runner metadata, and repeatability observations must be recorded. The experiment makes no bitwise-determinism guarantee.
