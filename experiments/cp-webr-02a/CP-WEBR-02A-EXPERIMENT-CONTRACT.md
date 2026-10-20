# CP-WEBR-02A Experiment Contract

## 1. Specification & Identification

- **Stage:** CP-WEBR-02A — Synthetic-Only Integration Adapter, Native Oracle Boundary & Production Entry Review
- **Repository:** `ErenTahiroglu/ClinicalPSM`
- **Branch:** `development`
- **Required Baseline SHA:** `2e5dfcff8f03d0e3ce3d212f731bcd6082061a7d`
- **Previous Stage:** `CP-WEBR-01B R1.1 — CLOSED_WITH_RESTRICTIONS`
- **Reviewer Authority:** ChatGPT — Independent Scientific & Security Red Team
- **Permitted Overall Verdicts:**
  - `ADAPTER_PASS_FOR_INTEGRATION_REVIEW`
  - `ADAPTER_INSUFFICIENT`
  - `ADAPTER_FAIL`

---

## 2. Objective & Scope

Prepare the first implementation-ready WebR adapter for ClinicalPSM, using strictly synthetic fixtures.

This stage is an isolated engineering implementation stage, not the activation of the production statistical engine. It demonstrates how the approved TypeScript → Dedicated Worker → WebR → MatchIt/cobalt pipeline operates without creating a second statistical computation engine.

### Strict Negative Boundaries (Prohibitions)

1. Zero modifications to the active application runtime under `apps/web/` or production code under `clinicalpsm/src/lib/psm/`.
2. Zero activation of CSV uploads for clinical users or real patients.
3. No replacement or production activation of the legacy TypeScript PSM engine.
4. No changes to `main` branch.
5. No deployment to Cloudflare or public domains; no DNS alterations.
6. No user account, billing, or Polar.sh payment integrations.
7. No real patient or protected clinical data; synthetic fixtures exclusively.
8. No new unvalidated statistical algorithms or heuristic approximations.
9. No modification of frozen numerical tolerances (`eps <= 1e-4`).
10. No arbitrary new R package dependencies beyond the pinned toolchain.
11. No remote branch deletions.

---

## 3. Pinned Scientific Toolchain

All statistical operations are performed strictly within the official pinned environment:

- **WebR Runtime:** `0.6.0` (compiled with Emscripten 5.0.7)
- **R Base Language:** `4.6.0` (2026-04-24)
- **MatchIt Package:** `4.8.1` (Ho, Imai, King, Stuart)
- **cobalt Package:** `5.0.0` (Greifer)

---

## 4. Architectural Boundaries & Pipeline Structure

```
TypeScript Input Contract (Clinical Headers)
                   │
                   ▼
       [ SymbolMapper (NFC, Aliasing) ]
                   │
                   ▼
  [ Dedicated Worker Lifecycle Manager ]
                   │
                   ▼
  [ WebR Child Environment Parameter Binding ]
  - RInteger(trt_00)
  - RDouble(cov_00, ...)
  - RCharacter(row_ids, target_names)
                   │
                   ▼
   [ Trusted Static R Computation Template ]
   - stats::reformulate()
   - stats::glm(family = binomial(link = "logit"))
   - MatchIt::matchit(method = "nearest", distance = "glm", link = "linear.logit", m.order = "largest")
   - cobalt::bal.tab(s.d.denom = "treated", binary = "raw", un = TRUE)
   - cobalt::bal.tab(s.d.denom = "treated", binary = "std", un = TRUE)
                   │
                   ▼
    [ Canonical Serializer & Envelope ]
    - Defensive copying (structuredClone)
    - Non-finite null representation
    - SHA-256 verification hash
                   │
                   ▼
CanonicalPsmResult Envelope (Versioned, Lexicographical)
```

---

## 5. Independent Governance Gates

1. **`FULL_PRECISION_NATIVE_R_ORACLE = BLOCKED`**
   - The double-precision reference was captured from official MatchIt 4.8.1 and cobalt 5.0.0 on WebR/R 4.6.0 runtime. It must not be labeled as an independent native host R oracle until validated on an independent native R 4.6.0 installation.

2. **`PRODUCTION_LICENSING_CLEARANCE = BLOCKED`**
   - MatchIt (GPL-2 / GPL-3) and cobalt (GPL-2 / GPL-3) browser-side distribution clearance requires formal licensing audit prior to commercial software distribution.

3. **`AUTOMATED_SEPARATION_SAFETY = BLOCKED`**
   - Algorithmic convergence (`glm$converged == TRUE`) is mathematically decoupled from separation parameter instability. No general separation detector exists; publication restriction is enforced when severe separation symptoms arise.

4. **`EXACT_PAIR_AND_WEIGHT_PARITY = PASS`**
   - 100% exact matched pair identity and weight equality validated across preserved fixtures within `eps <= 1e-4`.

5. **`WORKER_CSP_QUALIFICATION = PASS`**
   - Dedicated Worker and WebR internal worker evaluated under both strict and permissive CSP profiles.

6. **`WORKER_LIFECYCLE_SUITE = PASS`**
   - State machine, concurrency queueing, interruption, termination, and restart recovery verified.

7. **`STORAGE_PRIVACY_AUDIT = PASS`**
   - Deep inspection across checkpoints T1–T5; 5-fault fail-closed injection verified; zero patient sentinel residue detected.
