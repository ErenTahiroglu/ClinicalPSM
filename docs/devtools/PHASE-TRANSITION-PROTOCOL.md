# Phase Transition Protocol

Repeatable at every phase boundary. Scripts: `scripts/devtools/phase-begin.sh`, `phase-end.sh`, `check-tools.sh`, `gates.mjs`. Tool binaries are never upgraded here (see TOOLCHAIN-MANIFEST.md).

## Beginning of a phase
```
PHASE=<last approved phase> bash scripts/devtools/phase-begin.sh <expected-HEAD-sha> [expected-branch]
```
| Step | What | Evidence recorded |
|---|---|---|
| 1 | Verify exact `HEAD` equals the expected SHA and show its parent. A mismatch stops the phase and is reported. | printed |
| 2 | Show branch and worktree path; list `git status --porcelain`. Research/owner-owned untracked paths (`Derin Araştırma/`) are listed but are not a failure; any other change is investigated. | printed |
| 3 | `check-tools.sh` against `versions.env` (PASS/FAIL/WARN/BLOCKED). A tool that is missing or off-version means the matching verification loses coverage: say so, never report PASS. | printed |
| 4 | Graphify: `graphify update .` (code-only, API-key variables unset). | node/edge counts |
| 5 | Codebase Memory MCP: `index_repository` (mode `fast`, `persistence=false`) from the agent session, or the CLI when no other CBM process is active. | node/edge counts |
| 6 | Coverage/freshness: `check_index_coverage` on the files the phase will touch; Graphify node count. Treat "clean" as best-effort and read source when in doubt. | tool output |
| 7 | Baseline gates (`gates.mjs --only base`). | gate table |
| 8 | Record pre-existing findings (gitleaks baseline entries, known WARNs) in the phase report. | report section |

## End of a phase
```
PHASE=<phase being closed> BASE_REF=<previous-phase-sha> bash scripts/devtools/phase-end.sh
```
1. Full cumulative gate matrix (`gates.mjs --phase <phase>`): PASS / FAIL / BLOCKED / NOT_APPLICABLE.
2. Gitleaks: history (new findings fail; baseline findings are listed), scanner self-test, and a staged-changes scan before the commit.
3. Refresh both graphs.
4. Impact analysis: Codebase Memory `detect_changes` against the previous phase branch (scope `impact`), plus `graphify affected "<symbol>"` for each changed exported symbol.
5. Review new routes, workers, workflows, dependencies (lockfile diff) and secrets.
6. Collect coverage and test evidence verbatim (commands and outputs).
7. Write the phase report (`docs/audits/<PHASE>-…-REPORT.md`) with exact SHAs, tool versions, gate table and unresolved items. Distinguish tests executed in this phase from earlier reported ones.
8. Commit only the bounded files (`git add <explicit paths>`; never `git add -A` where owner-owned untracked material exists), run `gitleaks staged`, push the phase branch.
9. Stop. The next phase begins only after the independent Red Team decision. No self-authorization.

## Rules
- Indexes refresh every phase; binaries upgrade only via the maintenance procedure.
- Index only approved source scopes; never PDFs, research folders, datasets, credentials or backups. No document/LLM semantic extraction without separate approval.
- Generated graphs, databases, logs, reports and `.tools/` stay out of Git (`.gitignore` entries).
- If a real credential is found: stop exposure, report category/location/severity only (never the value), recommend rotation, do not rewrite history or delete files automatically.
- Never use `git clean` or `git reset --hard`.
