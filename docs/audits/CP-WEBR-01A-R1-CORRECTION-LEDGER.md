# CP-WEBR-01A R1 — Correction Ledger

**Repository:** `ErenTahiroglu/ClinicalPSM`
**Phase:** `CP-WEBR-01A R1 — Scientific, API, Licensing & Canonical Contract Correction`
**Branch:** `development`
**Baseline Requiring Correction:** `702f2be421979624d77fd047accd11940d32b23a`
**Red Team Verdict:** `PASS_WITH_MAJOR_REVISIONS — NOT CLOSED`
**Authority:** Independent Red Team (ChatGPT)

---

## 1. Purpose

This ledger records every deficiency identified in the CP-WEBR-01A Independent Red Team review and the exact corrective change applied to resolve it.

---

## 2. Correction Record

### CORR-001 — P0: Remove Unsupported Separation Thresholds

| Field | Value |
| :--- | :--- |
| **Severity** | P0 — Scientifically Invalid Normative Claim |
| **Affected Documents** | `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md`, `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md`, `docs/audits/CP-WEBR-01A-RED-TEAM-HANDOFF.md` |

`|beta_j| > 10.0 OR SE(beta_j) > 50.0` removed from all contracts. These are not validated universal diagnostics; they reflect one observed symptom in fixture `fix_16` only.

Replaced with observable-symptom language: fitted probs collapsing to 0/1, extreme SEs in thousands, IRLS divergence. Blocker flags added: `SEPARATION_DETECTOR = NOT_IMPLEMENTED`, `AUTOMATED_SEPARATION_SAFETY = BLOCKED`.

---

### CORR-002 — P0: WebR 0.6.0 Object-Binding API Verification

| Field | Value |
| :--- | :--- |
| **Severity** | P0 — Non-Existent API Used in Contract |
| **Affected Documents** | `docs/security/CP-WEBR-01-SECURITY-AND-PRIVACY-GATES.md`, `docs/audits/CP-WEBR-01A-RED-TEAM-HANDOFF.md`, `docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md` |

`webr.objs.setData()` does not exist in WebR 0.6.0. Replaced throughout with verified API:

```typescript
// Correct WebR 0.6.0 binding:
const env = await new webR.REnvironment();
await env.bind('clinicalpsm_treatment', treatmentRVec);
await webR.evalR(code, { env });
```

Source of truth: `node_modules/webr/dist/webR/webr-main.d.ts`.

---

### CORR-003 — P0: Licensing Inventory Reconciliation Against Dependency Lock

| Field | Value |
| :--- | :--- |
| **Severity** | P0 — SBOM Fabricated; Not Derived from Locked Source |
| **Affected Document** | `docs/architecture/CP-WEBR-01-LICENSING-AND-DISTRIBUTION.md` |

Prior table had 26 rows with stale versions and fabricated packages. Replaced with exact 21-package inventory from `experiments/cp-webr-00b/dependency-lock.json`.

Packages removed (not in lock): `backports`, `chk`, `crayon`, `digest`, `magrittr`, `tibble`, `pillar`, `munsell`

Packages added (missing from prior table): `arg 0.2.1`, `Rcpp 1.1.2`, `S7 0.2.2`, `R6 2.6.1`

Key version corrections: `rlang` 1.1.5→1.3.0, `cli` 3.6.5→3.6.6, `glue` 1.8.0→1.8.1, `ggplot2` 3.5.1→4.0.3, `withr` 3.0.2→3.0.3, `vctrs` 0.6.5→0.7.3.

---

### CORR-004 — P1: Result Immutability Documentation

| Field | Value |
| :--- | :--- |
| **Severity** | P1 — Missing Normative Immutability Constraint |
| **Affected Document** | `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md` |

Section 4 header updated to explicitly state: result frozen with `Object.freeze()` upon creation; no downstream consumer may mutate any field; all publication artifacts must reference the frozen snapshot directly.

---

### CORR-005 — P1: Scientific Result Semantics — Rubin’s B and R

| Field | Value |
| :--- | :--- |
| **Severity** | P1 — Misleading / Underspecified Field Documentation |
| **Affected Document** | `docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md` |

`rubinB` and `rubinR` fields now carry precise mathematical semantics:

- **rubinB:** Absolute standardized difference of propensity score *means* (treated vs. control post-match), standardized by pooled pre-match SD. Rubin (2001): B < 25 informational only.
- **rubinR:** Ratio of matched treated to matched control propensity score variances. Rubin (2001): 0.5 < R < 2 informational only.
- Both explicitly marked as informational diagnostics; they do not override SMD-based balance assessment.

---

### CORR-006 — P1: Security & Privacy Language

| Field | Value |
| :--- | :--- |
| **Severity** | P1 — Underspecified Security Constraint |
| **Affected Document** | `docs/security/CP-WEBR-01-SECURITY-AND-PRIVACY-GATES.md` |

(a) `connect-src 'self'` clarified: “(permits same-origin requests only — zero external origins)”.

(b) New **Section 4.3 Symbol Mapping Language Requirements** added:
- Reversible symbol mapping: bidirectional and lossless; original names shown in all user-visible outputs.
- No irreversible escaping: original column name preserved in `CanonicalPsmResult.factorConfiguration`; sanitized alias is internal-only.

---

### CORR-007 — P1: Architecture Consistency

| Field | Value |
| :--- | :--- |
| **Severity** | P1 — Internal Cross-Document Inconsistency |
| **Affected Document** | `docs/audits/CP-WEBR-01A-RED-TEAM-HANDOFF.md` |

- Section 2.2: WebR API updated to REnvironment pattern; `webr.objs.setData()` prohibition noted.
- Section 2.3: Numeric thresholds removed; observable-symptom separation language applied.
- Status field: `R1 Correction Submitted — Awaiting Red Team Re-Approval`.

---

## 3. Unchanged Decisions

| Decision | Status |
| :--- | :--- |
| WebR 0.6.0 + R 4.6.0 + MatchIt 4.8.1 + cobalt 5.0.0 | LOCKED |
| Dedicated Web Worker isolation | LOCKED |
| Fail-closed on separation / rank deficiency / optimizer failure | LOCKED |
| GPL binary distribution obligations | LOCKED |
| `PRODUCTION_LICENSING_CLEARANCE = BLOCKED` | LOCKED |
| SEC-GATE-01/02/03/04 gate specifications | LOCKED |
| No production code changes in this phase | LOCKED |

---

## 4. Verification Checklist

| Check | Result |
| :--- | :--- |
| Baseline SHA `702f2be` confirmed | PASS |
| No production source files modified | PASS |
| No changes to `main` | PASS |
| No new permanent remote branches | PASS |
| Numerical tolerances unchanged | PASS |
| SBOM reconciled against `dependency-lock.json` (21 packages) | PASS |
| `webr.objs.setData()` removed from all contracts | PASS |
| `|beta|>10 / SE>50` removed from all contracts | PASS |

---

## 5. Formal Disposition

**R1 Correction Status:** `COMPLETE — AWAITING RED TEAM RE-REVIEW`

All seven deficiencies addressed. No production code modified. No numerical results altered.

**Ready for:** CP-WEBR-01A R1 Independent Red Team Re-Approval → proceed to `CP-WEBR-01B`.
