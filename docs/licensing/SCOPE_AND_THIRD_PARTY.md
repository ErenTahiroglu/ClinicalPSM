# ClinicalPSM — License scope and third-party materials

**Documentation notice date:** 25 October 2026
**Intended first-party license:** [PolyForm Strict License 1.0.0](../../LICENSE.md)
**Official unchanged legal text:** https://polyformproject.org/licenses/strict/1.0.0

## 1. Scope of the declaration

The root `LICENSE.md` reproduces the official, unmodified PolyForm Strict License 1.0.0. It expresses the current licensing intent for **original ClinicalPSM material only insofar as the licensor owns or is authorized to license its copyright**. Availability of repository source code does not grant permission to modify or redistribute it under PolyForm Strict. Noncommercial uses remain subject to the exact license, including its defined permitted purposes.

Separate written permission from the relevant rights holder is required for otherwise unlicensed commercial exploitation, copying, modification or redistribution; obtaining such permission is not automatic. The README summary is informational; if it differs from the license, the exact legal text controls.

## 2. Previously published MIT statement

At the verified pre-change `development` commit `b03938c4b1c6806434cead26d00692b6a4745984`, root `README.md` stated that the project was under MIT, although no root `LICENSE` or `LICENSE.md` was present. This is a provenance inconsistency, **not evidence that no license rights were ever granted**. Changing a README or adding a different license does not retrospectively cancel valid earlier MIT licenses, third-party licenses, agreements or rights granted by other copyright holders. Historical grants and contribution ownership have not been adjudicated by this documentation update.

## 3. Third-party dependencies retain their own rights

PolyForm Strict must **not** be represented as relicensing third-party software. Dependency code, generated/vendor assets, upstream contributions, runtimes, package binaries, notices and datasets retain their applicable copyrights and licenses. Existing research inventories include [WebR/R/package licensing and SBOM notes](../../experiments/cp-webr-00b/licenses-and-sbom.md). That document is a research-phase inventory and **not** a complete legal compliance certificate.

In particular, the existing inventory identifies GPL-licensed components such as the R runtime, MatchIt and cobalt, plus components under MIT, LGPL, BSD and other terms. Where bundling, embedding, distributing, linking to or serving a third-party component creates obligations, those obligations remain in force regardless of this project's first-party license notice. This update does not decide which artifacts are distributed or whether a derivative/combined work is formed.

Do not strip upstream attribution or copyright notices. Do not apply a restrictive header to third-party files without ownership and compatibility review.

## 4. Release and scientific boundaries

This license documentation change does not modify frozen CP-STAT-02 evidence, research protocols, statistical analysis, solver requirements, data-retention or security controls. It is **not** authorization for deployment, numerical experiment execution, commercialization or a merge to the protected `main` branch.

**Open follow-up:** validate the copyright/contribution provenance and concrete distribution obligations for the exact release artifact before claiming complete license compatibility or commercial-distribution clearance. The default `main` branch remains independently release-gated.
