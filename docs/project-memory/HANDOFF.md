# A2 Handoff Protocol — new chat / Claude Code / GitHub connector

**Purpose:** resume scientific work using GitHub evidence, not remembered narratives.

## Required new-session bootstrap

1. Read this directory starting at [README.md](README.md); then [CURRENT_STATE.md](CURRENT_STATE.md), [DECISION_LEDGER.md](DECISION_LEDGER.md), [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md).
2. Through connected GitHub client or `git`, verify live SHA of `development` and `main`, and compare with last accepted *scientific* SHA in CURRENT_STATE. A docs-only memory commit may legitimately move `development` beyond the scientific SHA. Do not silently treat the previous commit as the current HEAD.
3. Fetch [A2 parent #3](https://github.com/ErenTahiroglu/ClinicalPSM/issues/3) and all linked child states, especially [#4](https://github.com/ErenTahiroglu/ClinicalPSM/issues/4), [#7](https://github.com/ErenTahiroglu/ClinicalPSM/issues/7), [#8](https://github.com/ErenTahiroglu/ClinicalPSM/issues/8), [#9](https://github.com/ErenTahiroglu/ClinicalPSM/issues/9). A stale open/closed state in a cached doc is not authoritative.
4. Read the exact SHA-pinned input and source contracts for the **one authorized issue**. Don't reproduce whole A1 experiment, rewrite original FAIL, or re-run CI simply to obtain a green status.
5. Work strictly inside the assigned issue's gate. Preserve a clean commit diff, artifact/member hashes, missingness/error outcomes, exact science, negative controls, and execution upper bounds.
6. Return a report for independent ChatGPT Red Team review. A task result labelled READY is **not** independent acceptance.
7. Once accepted: independently verify evidence, post comprehensive issue closure comment, close the accepted issue (if warranted), update #3 dependency checklist, then update the memory index. Keep unresolved tasks OPEN.
8. At A2 independent closure, and **only then**, start the owner's requested whole-repository issue and documentation reconciliation.

## Readable resume instruction

> Continue ErenTahiroglu/ClinicalPSM on the live development branch. Read `docs/project-memory/README.md`, `CURRENT_STATE.md`, `DECISION_LEDGER.md`, `EVIDENCE_INDEX.md`, `HANDOFF.md` first at the actual development SHA. Verify parent issue #3 and child issue states via GitHub. Preserve A1 48/50 PASS, 2 FAIL and NOT_QUALIFIED; fixture 31 mathematically complete, fixture 33 mathematically finite-MLE overlap; both detector numerical causes unresolved. Read exact #7 latest independent Red Team issue comment (issuecomment-6387366807): A2-03A plan is accepted, but A2-03B must freeze a separate additive v1.1 interpretation annex **before** any of the 32 bounded HiGHS calls. #7 stays OPEN; #8 separately OPEN. Check actual live development HEAD because a later docs-only memory snapshot may have advanced it. No production changes, no 50-case rerun, no altered thresholds, no main merge/deployment. Await independent Red Team adjudication before closing issues or starting a later phase.

**Limitations:** This is a durable repo *reference* only, not proof of a current runtime state. Always verify against GitHub branch/issue metadata. Root `CLAUDE.md` and `README.md` have legacy claims; do not let them override ratified WebR/scientific artifacts before post-A2 documentation reconciliation.
