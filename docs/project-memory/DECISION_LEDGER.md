# A2 Decision Ledger — append-only adjudicated decisions

**Rules:** Decisions are dated, reviewer-attributed and evidence-linked. Never edit a historical scientific verdict merely because an issue was closed. Correct subsequent facts with a new dated entry. The ledger covers **A2 and immediately necessary prerequisites only**; a full repo-wide ledger comes after A2.

### A2-DEC-001 — 2026-10-24 — Previous CP-WEBR-02 boundary retained
**Decision:** CP-WEBR-02 is closed **only under** separately ratified Scientific Equivalence Amendment v1; original strict parity remains FAIL, and CP-STAT-02 retains 100% semantic/numeric tolerance requirements. **Evidence:** `experiments/cp-webr-02-closure/ratification-v1/CP-WEBR-02-RATIFICATION-v1.md` and amendment SHA-256 `9d0471d573033b96ff4341459eb6f39e03089140d7d4c6196d222a9c1c128d21`. **Not authorized:** clinical production safety/release.

### A2-DEC-002 — 2026-10-24 — A1 qualification fails scientifically, archive complete
**Decision:** 50/50 fixture scenarios assessed, 48 PASS, 2 scientific FAIL, `NOT_QUALIFIED`; fixture 31 tolerance-sensitive, fixture 33 false positive. **Evidence:** [A1 run 40097510667](https://github.com/ErenTahiroglu/ClinicalPSM/actions/runs/40097510667), artifact 12560933385 and digests in [EVIDENCE_INDEX.md](EVIDENCE_INDEX.md). Do not report 50/50 scientific PASS.

### A2-DEC-003 — 2026-10-24 — Source audit #5 accepted and closed
**Decision:** The tag-pinned v0.4 source proves `control$tolerance` is an LP-solution **classification threshold**, not underlying primal feasibility control; helper `check_ROI_solver()` is in `R/auxiliary.R`. The ROI path and separate lpSolveAPI branches were documented without implying A1 used the latter. **Evidence:** [#5 closure](https://github.com/ErenTahiroglu/ClinicalPSM/issues/5), [commit `4ab9509f`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/4ab9509f550f15af52bad8c2199c8102f10e61b7). **Not established:** causes of fixture 31/33 differences.

### A2-DEC-004 — 2026-10-24 — Exact archived ground truth #6 accepted and closed
**Decision:** Independent exact-rational reconstruction of original A1 model-matrix archive confirms mathematical **complete separation** for fixture 31 and **finite unique logistic MLE/no weak separation** for fixture 33. Source proof script reports 11 local tests passed; reviewer separately recomputed both certificates. **Evidence:** [#6 detailed independent close report](https://github.com/ErenTahiroglu/ClinicalPSM/issues/6), [commit `0f27cf3`](https://github.com/ErenTahiroglu/ClinicalPSM/commit/0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd). **Still true:** candidate A1 48/2 FAIL, numerical cause `UNRESOLVED`, general detector `NOT_QUALIFIED`.

### A2-DEC-005 — 2026-10-24 — Scoped durable GitHub memory pilot
**Decision:** Treat issues as actionable workflow and closure trails, committed evidence as scientific provenance, and these documentation files as **curated, lower-priority** memory snapshots. Do not equate any closed issue with a scientifically qualified detector or migrate this pilot to whole-repo scope before A2 ends. **Evidence:** [governance issue #14](https://github.com/ErenTahiroglu/ClinicalPSM/issues/14). **Implementation status:** this documentation-only memory pilot; verify live repo commit before claiming completion.
