# ClinicalPSM — Durable GitHub Project Memory

**Scope:** CP-STAT-02-A2 **pilot only**, introduced 2026-10-24 under [issue #14](https://github.com/ErenTahiroglu/ClinicalPSM/issues/14). **This is an index, not a new scientific contract, deployment approval or replacement for primary evidence.** All other repo-wide work and document reconciliation are deferred until A2 finishes.

## Start here

1. Read [CURRENT_STATE.md](CURRENT_STATE.md) for the last independently adjudicated snapshot.
2. Read [DECISION_LEDGER.md](DECISION_LEDGER.md) for date- and evidence-pinned dispositions.
3. Read [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md) for original source, hashes, CI, and contradictions.
4. Read [HANDOFF.md](HANDOFF.md) before giving the next task to Claude/ChatGPT.
5. Fetch GitHub's **live** `development` and `main` HEADs, read the live [A2 parent #3](https://github.com/ErenTahiroglu/ClinicalPSM/issues/3), and confirm each referenced child issue state. Never assume a static Markdown snapshot is live.

## Trust order, conflicts, and state vocabulary

1. Hash-verified original scientific artifacts and commit-pinned source bytes.
2. Ratified scientific contracts and independently reviewed versioned evidence.
3. Exact-SHA GitHub CI and issue acceptance/closure comments with explicit reviewer adjudication.
4. Curated snapshots in this directory.
5. Freeform chat/agent reports; these must be checked against the above.

For scientific claims, primary evidence supersedes CI color, a closed GitHub issue, and any state summary. If two sources disagree, preserve both, log `CONFLICT/UNVERIFIED` with links, and escalate before changing a conclusion.

**`CLOSED` means a scoped work item was completed or intentionally not planned; it never implies scientific PASS.** `NOT_QUALIFIED`, `FAIL`, `UNMEASURED`, `UNRESOLVED`, `BLOCKED` are not success aliases.

## Event-based update protocol (no automatic background agent)

After independently accepting each bounded phase/issue:
- Verify branch HEAD, one-commit diff, source and data hashes, CI runs, negative controls and exact failure matrix.
- Add an evidence-rich **issue closure/comment** first, and close only independently accepted tasks.
- Update `CURRENT_STATE.md`, append a new item in `DECISION_LEDGER.md` as needed, and add immutable pointers or documented errata in `EVIDENCE_INDEX.md` in one bounded docs-only commit on `development`.
- Reference that memory commit in parent issue #3; preserve full original artifacts/decisions. An issue status update and a memory snapshot can be asynchronous *only if that temporary discrepancy is explicitly labelled*.
- Never regenerate evidence, rewrite earlier FAILs, or change a numerical scientific tolerance as a documentation fix.

## Security, retention, and limitations

Never commit patient data, identifiers, upload samples, API tokens, secrets, local absolute paths, private artifact URLs, or entire large archived ZIPs. Hash and link immutable evidence instead. GitHub Actions artifacts have retention limits: **a hash without a preserved copy cannot recover lost bytes**. After owner approval and appropriate access controls, maintain a separate verified off-device backup for original evidence archives; backup provisioning is NOT included in this pilot.

**Legacy-document caution:** as of this snapshot root `CLAUDE.md` and `README.md` contain historic TypeScript/Supabase/Vercel claims and should not silently override the exact current WebR/scientific contracts. Their *full repository-wide* reconciliation is deferred to post-A2 inventory; do not infer current deployed architecture from this warning alone.

This directory must be explicitly fetched/read by each new agent. Merely adding it to GitHub does not guarantee automatic cross-chat memory or loading by Claude Code.
