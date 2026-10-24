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

> Continue ErenTahiroglu/ClinicalPSM on the live development branch. Read `docs/project-memory/README.md`, `CURRENT_STATE.md`, `DECISION_LEDGER.md`, `EVIDENCE_INDEX.md`, `HANDOFF.md` first at the actual development SHA. Verify parent issue #3 and child issue states via GitHub. Preserve A1 48/50 PASS, 2 FAIL and NOT_QUALIFIED; fixture 31 mathematically complete, fixture 33 mathematically finite-MLE overlap; both detector numerical causes unresolved. Read latest GitHub #7 blocker comment (issuecomment-6388173734) and #15 recovery issue. A2-03B original run 40121998475 failed BEFORE PRE-FLIGHT on missing pip report directory: **0/32 SciPy/HiGHS**, no numeric outcome; frozen additive v1.1 annex already committed at cc607737. #15 requires a bounded, offline-reviewed CI bootstrap correction and **separate explicit authorization of any new run**; do not repeat the consumed workflow. #7 and #8 remain OPEN. Check live development SHA because a later docs-only memory commit will advance it. No production changes, no 50-case rerun, no altered thresholds, no main merge/deployment. Await independent Red Team adjudication before closing issues or starting a later phase.

**Limitations:** This is a durable repo *reference* only, not proof of a current runtime state. Always verify against GitHub branch/issue metadata. Root `CLAUDE.md` and `README.md` have legacy claims; do not let them override ratified WebR/scientific artifacts before post-A2 documentation reconciliation.

## Specific next-chat task after A2-03B blocked first run

1. Verify live `development` (`cc607737e8725e2d774d8bf34686e9055572301e` was last experimental SHA), unchanged `main`, [CI 40121998475](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998475), [artifact 12571224297](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40121998475/artifacts/12571224297), parent #3, #4, #7 and #15. Any newer doc-only SHA is not a new scientific observation.
2. Independently inspect the workflow steps and constrained engineering issue #15. Confirm that staging must be prepared AFTER checkout, pip report parent exists, and GitHub summary printf does not shell-execute Markdown backticks. Inspect harness fail-closed blocker flow too.
3. Do **not** give Claude a science rerun prompt immediately. Request/prepare a **static-only and non-auto-triggering engineering patch**, review exact SHA and diff, then grant at most one explicitly new authorized execution if all original frozen contracts and security guards hold. If any new uncontrolled failure, STOP.
4. Once independent scientific output finally exists and is accepted, update #7 with provenance and decide whether it can close; #8 negative-control branch and #9 F1 closure still pending. A2 parent remains OPEN.
