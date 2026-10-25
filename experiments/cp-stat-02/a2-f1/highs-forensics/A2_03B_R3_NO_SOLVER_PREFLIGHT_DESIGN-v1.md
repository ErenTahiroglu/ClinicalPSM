# A2-03B R3 No-Solver CI Preflight Design v1

**Status:** Design proposal only. No workflow file has been created or run.

**Authorization required:** A dedicated Red Team authorization is required before creating the staging branch or pushing its single authorized commit. A separate, later authorization is required for any 32-call numerical experiment.

## Purpose and boundary

Validate the exact execution prerequisites on the pinned GitHub-hosted runner without invoking SciPy `linprog`, HiGHS, or a numerical worker. A successful result means only `PREFLIGHT_ONLY_READY_FOR_RED_TEAM`; it does not authorize or imply a numerical experiment.

The implementation entry point is the proposed fixed command:

```text
python experiments/cp-stat-02/a2-f1/highs-forensics/a2_03b_harness.py preflight-only \
  --evidence-dir .a2-03b/evidence \
  --download-dir .a2-03b/download \
  --pip-report .a2-03b/pip-install-report.json \
  --toolcache-snapshot .a2-03b/evidence/python-toolcache-pre-setup.json
```

This path shares the frozen environment, wheel receipt, archive, matrix, proof, manifest, LP-construction, and falsification-control gates with the experiment preflight. It returns before `run_cell_processes`; its call graph contains no `worker_cell`, `run_cell_processes`, `subprocess.run`, or `linprog` call.

## Trigger-safe staging and invocation plan

### Verified deployment facts

The GitHub default branch is `main`. At the authorized source baseline, `origin/main` contains only `.github/workflows/ci.yml`; that workflow is scoped to pushes and pull requests targeting `main` and has no `workflow_dispatch` trigger. No suitable default-branch workflow exists that can invoke this fixed no-solver path. The development branch's A1 dispatch workflow is a scientific workflow and is not suitable; its presence on development does not satisfy GitHub's default-branch requirement.

GitHub documents that `workflow_dispatch` requires the workflow file on the default branch. By contrast, a `push` event can run a workflow that has not been merged to the default branch. The feasible design is therefore an isolated, separately authorized branch push, not dispatch from a non-default branch.

### Selected Option A — isolated preflight branch with exact branch push

- Staging branch name: `preflight/a2-03b-r3-rt1-6390460408`.
- Required base commit: `b03938c4b1c6806434cead26d00692b6a4745984` on `development`.
- Staging commit: deliberately **unassigned** until a later independent authorization permits local branch/commit preparation. Before any remote push, the resulting exact commit SHA, tree, workflow hash, v1.3 lock hash, and complete changed-file list must be submitted for a second explicit authorization. No branch, commit, or push is created by this design task.
- Add one separate workflow file on that branch, for example `.github/workflows/a2-03b-r3-preflight-only.yml`. The workflow is present in the pushed branch commit, so the `push` event can discover and run it without placing it on `main`.
- Trigger: `on: push` with the exact branch filter `branches: [preflight/a2-03b-r3-rt1-6390460408]`, plus narrow `paths` covering the accepted R3 files and this workflow. It has no `workflow_dispatch`, `pull_request`, `workflow_run`, schedule, or generic reusable-workflow trigger.
- The A2-03B numerical workflow is constrained to `push.branches: [development]` and requires its own path filters. The isolated branch name fails its branch filter even though the commit contains A2-03B files. The A1 workflow is also restricted to `development` for push/PR, and no pull request is created. Therefore neither dedicated statistical experiment is triggered by this branch push.
- On the current development workflow inventory, the ordinary `Security (gitleaks)` and `Cumulative gates` workflows have unfiltered push triggers and are expected to run on the isolated branch. The regular `ci.yml` is scoped to `main` and is not expected. The other experiment workflows either require `development` or paths outside the CP-STAT-02 R3 changes. This expected-check list must be re-audited against the exact staging commit before any future authorization.
- The branch workflow should require a protected GitHub Environment such as `a2-03b-r3-preflight` with an independent reviewer. The reviewer must compare the run's `GITHUB_SHA` and ref with the separately authorized commit before approving the environment gate. If the repository cannot enforce the required reviewer, the plan is blocked.
- Before the one authorized push, an independent reviewer may set a repository variable `A2_03B_R3_PREFLIGHT_ALLOWED_SHA` to the exact candidate commit SHA. The job must fail closed unless `GITHUB_SHA` equals that value and `GITHUB_REF` is the exact staging ref. Setting this variable is an external repository write and requires separate authorization. No variable value is set by this local proposal.
- Workflow permissions: `contents: read` and `actions: read` only. The token is used only to read the frozen original A1 artifact. No issue, pull-request, deployment, production, or content-write permission. Artifact upload uses the standard Actions runtime receipt; if the selected artifact action requires additional token scope, the workflow must stop for re-review rather than broaden permissions.
- One job, fixed runner, no matrix, fixed command, `timeout-minutes: 60`, and a ref-scoped concurrency group with `cancel-in-progress: false`. No retry loop, workflow dispatch, rerun, second push, or follow-up commit is authorized. Failed checks or missing evidence remain failed; the artifact step uses `if: always()` and `if-no-files-found: error`, while blocker status remains nonzero.
- Fixed command: the literal `python .../a2_03b_harness.py preflight-only ...` with fixed paths. No event input, branch text, or user-provided string is interpolated into shell source or the command name. The harness checks the exact v1.3 lock and the frozen 12-file identities; its receipt binds the report to `GITHUB_SHA`, lock SHA, workflow/harness SHA, A1 outer/internal hashes, proof/matrix hashes, manifest SHA, wheel report hashes, and 32 ordered manifest identities.
- Authorization sequence: (1) independent Red Team approves this design and all local files; (2) a new written authorization names the exact base SHA, branch, permitted local branch/commit operation, exact file set, and one-push ceiling; (3) after local candidate commit is created, report its exact SHA/tree/workflow/lock identities; (4) a second authorization names that exact SHA and approves setting the allowed-SHA variable plus one push; (5) the environment reviewer approves the resulting run only after checking the exact ref/SHA; (6) preserve the first run's logs/artifact and stop. If any gate fails, no push or run follows.

### Option B — existing default-branch dispatch workflow

Rejected after inspection. The exact `origin/main` workflow tree at the authorized baseline contains only `.github/workflows/ci.yml`, which runs Node project gates on `main` pushes/PRs and does not expose this no-solver Python command. It has no `workflow_dispatch`. No existing safe default-branch workflow can invoke the approved preflight. Adding the proposed workflow to `main` or merging into `main` is forbidden, so Option B is not available.

No active YAML is included in this local R3 patch. The current experiment workflow still automatically runs on pushes to `development` touching its existing path filters, including `A2_03B_*` files and the harness. Pushing these R3 files directly to `development` would start the scientific workflow. The isolated-branch design above is only a proposal and requires new explicit authorization; it must not be implemented or pushed now.

## Required preflight evidence

The run should record, as separate measured fields:

1. Runner OS/architecture, `/etc/os-release`, `ImageOS`, `ImageVersion`, and kernel identity, matched across pre-setup and post-setup observations.
2. Read-only pre-setup exact Python toolcache slot state, completion marker, executable path, size, and SHA-256.
3. Exact setup-python action commit and outputs (`python-version`, `python-path`). Dependency-cache status is `NOT_APPLICABLE` when the action's optional package cache is unconfigured.
4. Active CPython version, standard-GIL ABI, resolved executable path, executable size/SHA-256, build/compiler details, and comparison to the pre-setup toolcache receipt.
5. Pinned Python versions manifest commit, bytes SHA-256, selected release fields, and release URL. The prebuilt release asset digest remains explicitly unmeasured because the pinned manifest/action interface exposes no such digest. The existing CPython source archive hash remains labeled as a source-distribution hash.
6. Pip install report raw bytes and SHA-256 when safe to retain; exact pip/NumPy/SciPy wheel hashes and versions; SciPy wrapper binary hash and its pinned wheel/source provenance. Unsafe signed or credential-bearing URLs are omitted and produce a fail-closed blocker receipt.
7. Full v1.3 frozen-file verification and exact ordered 32-cell manifest verification.
8. The immutable A1 outer ZIP, embedded archive, full 160-member `SHA256SUMS`, matrix/response/row-order identities, exact-proof manifest, and accepted proof identities.
9. Static LP array/objective/bound construction checks for all 32 cells, registered solver options, and the single solver invocation-site assertion. These checks inspect LP definitions but call no optimizer.
10. All 15 frozen F-01 through F-15 controls, reported as local to the CI preflight and separate from any LP result.
11. A preflight status with zero LP calls and zero completed numerical cells, a full evidence checksum manifest, and a run receipt. The checksum manifest itself must be re-read and checked against the exact evidence file set before upload.

## No-solver enforcement

The only allowed command is the fixed `preflight-only` command. It does not call `run_experiment`, `worker`, `run_cell_processes`, `worker_cell`, or `linprog`. Static code-path tests must continue to reject any call-graph path from `preflight_only` or its pre-solver helper to those functions or subprocess creation. The preflight output must retain `linprog_invocation_attempts: 0`, `completed_manifest_cells: 0`, and `execution_permission_implied: false`, including failure receipts.

The workflow must not dispatch the existing experiment workflow, invoke `workflow_dispatch` on it, or use a generic harness command field. A preflight failure remains a preflight blocker and does not create an experiment retry.

## Invocation and acceptance boundary

There is no dispatch command in the selected design. Before the authorized branch push, the reviewer must record the exact candidate commit SHA, branch ref, v1.3 lock SHA-256, workflow and harness SHA-256, current ordinary CI state, required environment protection, allowed-SHA variable, and one-push/one-run limit. After the single push, approve the protected environment only if the event ref/SHA exactly match. Never rerun or retry; review actual job steps, artifacts, hashes, member checksums, and zero-call status.

Even a complete preflight pass does not start or authorize the 32-cell experiment. The numerical execution needs a distinct explicit single-shot authorization that names the exact approved commit and consumes its own allowance.
