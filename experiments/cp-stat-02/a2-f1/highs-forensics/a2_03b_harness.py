#!/usr/bin/env python3
"""Frozen A2-03B HiGHS numerical-forensics harness.

The default workflow path verifies all frozen inputs and synthetic controls
before the first linprog call. Each registered cell is run in one fresh child
process, with no retries.
"""
from __future__ import annotations

import argparse
import ast
import copy
import csv
import datetime as dt
import fractions
import hashlib
import importlib.metadata
import importlib.util
import io
import json
import math
import os
import pathlib
import platform
import shutil
import subprocess
import sys
import sysconfig
import tarfile
import tempfile
import time
import traceback
import urllib.error
import urllib.request
import warnings
import zipfile

BASE = pathlib.Path(__file__).resolve().parent
REPO = BASE.parents[3]
FREEZE_PATH = BASE / "A2_03B_FROZEN_INPUTS-v1.2.json"
MANIFEST_PATH = BASE / "A2_03B_EXECUTION_MANIFEST-v1.1.json"
CONTRACT_PATH = BASE / "NUMERICAL_ACCEPTANCE_CONTRACT.json"
ANNEX_JSON_PATH = BASE / "A2_03B_EXECUTION_INTERPRETATION-v1.1.json"
PROOF_DIR = REPO / "experiments/cp-stat-02/a2-f1/exact-proof"
ARCHIVE_NAME = ".cp-stat-02-a1-evidence.tar.gz"
ARCHIVE_SIDECAR = ARCHIVE_NAME + ".sha256"
EXPECTED_OUTER = "ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a"
EXPECTED_INNER = "326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554"
EXPECTED_PROOF_MANIFEST = "809aefbb94c320b9368bc740a38fa39c87db279da82a7f96aa8622a98add6ef4"
EXPECTED_A1_COMMIT = "579a2532a5fe210917e2b37e7d7f950c8d01d78f"
EXPECTED_PREREGISTRATION_COMMIT = "44b4faaa4b3ed9054a3b05be2741fb1c0d326cbe"
PYTHON_VERSIONS_MANIFEST_COMMIT = "9834b4e4911ca2950ff6c3b7547f09eacc006848"
PYTHON_RELEASE_URL = "https://github.com/actions/python-versions/releases/download/3.13.17-39711892467/python-3.13.17-linux-24.04-x64.tar.gz"
EXPECTED_RUN_ID = "40097510667"
EXPECTED_ARTIFACT_ID = "12560933385"
MATRIX_HASHES = {
    "cpstat02a1_31_small_scale_complete": "ea55df16749f235ee69b4634ec37408a2bb6361a9fb26b820170cbaf0373370e",
    "cpstat02a1_33_heterogeneous_scale_overlap": "be5efb7a008f0ca285691c32faff08b48df19054bd1f09bc25e0e1c10609add1",
}
EXPECTED_COLUMNS = ["(Intercept)", "x1", "x2"]
MAX_NORM_VIOLATION = 1e-8
REPEAT_LIMIT = 1e-8
MARGIN_FLOOR = fractions.Fraction(1, 100_000_000)
WHEEL_PINS = {
    "pip": ("26.2.2", "fd7f4dfa8190e014013b9f08f3e973f4e4c26ffd179a204895533a7254813a70"),
    "numpy": ("2.5.4", "6ffa07666f8da0eef81d149934a626d0d95fbd6838432a33e66245423a9062c0"),
    "scipy": ("1.18.1", "fdaf5ea890a6183d0565f51a61799d67081bd5b1cf03c5f4b3fd3732108625c9"),
}
FIXTURES = [
    "cpstat02a1_31_small_scale_complete",
    "cpstat02a1_33_heterogeneous_scale_overlap",
]
REPRESENTATIONS = ["raw", "column_max_normalized"]
METHODS = ["highs-ds", "highs-ipm"]
PROBLEMS = ["complete_margin_A", "weak_margin_B"]
REPEATS = [1, 2]


class PreflightError(RuntimeError):
    pass


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def write_json(path: pathlib.Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, allow_nan=False) + "\n", encoding="utf-8")


def load_json(path: pathlib.Path):
    return json.loads(path.read_text(encoding="utf-8"))


def exact(value) -> fractions.Fraction:
    if isinstance(value, fractions.Fraction):
        return value
    if isinstance(value, float):
        return fractions.Fraction(*value.as_integer_ratio())
    return fractions.Fraction(str(value))


def frac_record(value: fractions.Fraction) -> dict:
    return {"numerator": str(value.numerator), "denominator": str(value.denominator)}


def finite_float(value):
    try:
        number = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return number if math.isfinite(number) else None


def plain(value):
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, fractions.Fraction):
        return frac_record(value)
    if isinstance(value, float):
        return value if math.isfinite(value) else None
    if hasattr(value, "tolist"):
        return plain(value.tolist())
    if isinstance(value, dict):
        return {str(k): plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [plain(v) for v in value]
    try:
        import numpy as np
        if isinstance(value, np.generic):
            return plain(value.item())
    except Exception:
        pass
    try:
        number = float(value)
        return number if math.isfinite(number) else None
    except (TypeError, ValueError, OverflowError):
        return str(value)


def diagnostic_field_status(value):
    if value is None:
        return "UNMEASURED_MISSING"
    if hasattr(value, "tolist"):
        return diagnostic_field_status(value.tolist())
    if isinstance(value, (list, tuple)):
        states = [diagnostic_field_status(item) for item in value]
        if any(state == "UNMEASURED_NONFINITE" for state in states):
            return "UNMEASURED_NONFINITE"
        if any(state == "UNMEASURED_MISSING" for state in states):
            return "UNMEASURED_MISSING"
        return "PRESENT"
    if isinstance(value, (float, int)):
        return "PRESENT" if math.isfinite(float(value)) else "UNMEASURED_NONFINITE"
    try:
        import numpy as np
        if isinstance(value, np.generic):
            return diagnostic_field_status(value.item())
    except Exception:
        pass
    return "PRESENT"


def verify_frozen_files() -> dict:
    if not FREEZE_PATH.is_file():
        raise PreflightError("frozen input lock is missing")
    frozen = load_json(FREEZE_PATH)
    if frozen.get("schema") != "CP-STAT-02-A2-03B-FROZEN-INPUTS-v1.2":
        raise PreflightError("frozen input lock schema is not v1.2")
    if frozen.get("status") != "FROZEN_BEFORE_SOLVER":
        raise PreflightError("frozen input lock status is not FROZEN_BEFORE_SOLVER")
    if frozen.get("immutable_preregistration_commit") != EXPECTED_PREREGISTRATION_COMMIT:
        raise PreflightError("frozen lock does not identify the immutable A2-03A preregistration commit")
    if frozen.get("maximum_linprog_calls") != 32:
        raise PreflightError("frozen lock does not preserve the 32-call ceiling")
    expected_wheels = {name: values[1] for name, values in WHEEL_PINS.items()}
    if frozen.get("wheel_sha256") != expected_wheels:
        raise PreflightError("frozen lock wheel hashes differ from the exact package pins")
    expected_archive = {
        "workflow_id": EXPECTED_RUN_ID,
        "artifact_id": EXPECTED_ARTIFACT_ID,
        "outer_sha256": EXPECTED_OUTER,
        "internal_sha256": EXPECTED_INNER,
        "proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
        "matrix_sha256": MATRIX_HASHES,
    }
    if frozen.get("source_archive") != expected_archive:
        raise PreflightError("frozen lock source-artifact identity differs from A1 preregistration")
    expected_runtime = {
        "platform": "ubuntu-24.04 x86_64",
        "cpython": "3.13.17",
        "python_source_archive_sha256": "6020bd10aff3bf4821be16f088ebb1591beb7b811dcd8fab1da8f7c22a7b27e7",
        "python_versions_manifest_commit": PYTHON_VERSIONS_MANIFEST_COMMIT,
        "python_release_url": PYTHON_RELEASE_URL,
        "numpy": "2.5.4",
        "scipy": "1.18.1",
        "embedded_highs": "1.12.0",
    }
    if frozen.get("runtime") != expected_runtime:
        raise PreflightError("frozen lock runtime differs from the accepted solver environment")
    checked = {}
    for relative, expected in frozen.get("files_sha256", {}).items():
        path = REPO / relative
        if not path.is_file():
            raise PreflightError(f"frozen file missing: {relative}")
        actual = sha256_file(path)
        if actual != expected:
            raise PreflightError(f"frozen file hash mismatch: {relative}")
        checked[relative] = actual
    required = {
        "experiments/cp-stat-02/a2-f1/highs-forensics/HIGHS_PREREGISTRATION-v1.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/LP_MATHEMATICAL_CONTRACT.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/NUMERICAL_ACCEPTANCE_CONTRACT.json",
        "experiments/cp-stat-02/a2-f1/highs-forensics/SOLVER_ENVIRONMENT_LOCK.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/FALSIFICATION_PLAN.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/A2_03A_HANDOFF.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/A2_03B_EXECUTION_INTERPRETATION-v1.1.md",
        "experiments/cp-stat-02/a2-f1/highs-forensics/A2_03B_EXECUTION_INTERPRETATION-v1.1.json",
        "experiments/cp-stat-02/a2-f1/highs-forensics/A2_03B_EXECUTION_MANIFEST-v1.1.json",
        "experiments/cp-stat-02/a2-f1/highs-forensics/a2_03b_harness.py",
        "experiments/cp-stat-02/a2-f1/highs-forensics/requirements-a2-03b.lock",
        ".github/workflows/experiment-cp-stat-02-a2-03b.yml",
    }
    if set(checked) != required:
        raise PreflightError("frozen input lock file set differs from the exact required inputs")
    return {
        "lock_sha256": sha256_file(FREEZE_PATH),
        "checked_files": checked,
        "checked_file_count": len(checked),
    }


def expected_manifest_rows():
    rows = []
    for fixture in FIXTURES:
        fshort = "31" if "_31_" in fixture else "33"
        for representation in REPRESENTATIONS:
            rshort = "RAW" if representation == "raw" else "CMAX"
            for method in METHODS:
                mshort = "DS" if method == "highs-ds" else "IPM"
                for problem in PROBLEMS:
                    pshort = "A" if problem == "complete_margin_A" else "B"
                    for repeat in REPEATS:
                        rows.append({
                            "cell_id": f"F{fshort}-{rshort}-{mshort}-{pshort}-R{repeat}",
                            "fixture_id": fixture,
                            "representation": representation,
                            "method": method,
                            "problem": problem,
                            "repeat": repeat,
                            "fresh_process": True,
                        })
    return rows


def verify_manifest() -> dict:
    manifest = load_json(MANIFEST_PATH)
    expected = expected_manifest_rows()
    cells = manifest.get("cells")
    if manifest.get("cell_count") != 32 or manifest.get("maximum_linprog_calls") != 32:
        raise PreflightError("execution manifest does not freeze exactly 32 LP calls")
    if cells != expected or len(cells or []) != 32:
        raise PreflightError("execution manifest differs from the preregistered order or cell identities")
    if len({row["cell_id"] for row in cells}) != 32:
        raise PreflightError("execution manifest contains duplicate cell IDs")
    contract = load_json(CONTRACT_PATH)
    if contract["execution_matrix"]["maximum_linprog_calls"] != 32:
        raise PreflightError("immutable v1 contract call ceiling changed")
    if contract["execution_matrix"]["fresh_process_repeats_per_cell"] != 2:
        raise PreflightError("immutable v1 repeat count changed")
    return {
        "manifest_sha256": sha256_file(MANIFEST_PATH),
        "cell_count": len(cells),
        "cell_ids_in_order": [row["cell_id"] for row in cells],
        "status": "PASS",
    }


def _normalize_member(name: str) -> str:
    while name.startswith("./"):
        name = name[2:]
    return name


def parse_csv_bytes(raw: bytes, path: str):
    try:
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8"), newline="")))
    except Exception as exc:
        raise PreflightError(f"CSV parse failed: {path}: {exc}") from exc
    if not rows:
        raise PreflightError(f"CSV has no rows: {path}")
    return rows


def verify_github_artifact_metadata(metadata: dict, outer_hash: str) -> dict:
    if metadata.get("id") != int(EXPECTED_ARTIFACT_ID):
        raise PreflightError("GitHub artifact ID mismatch")
    if metadata.get("expired") is not False:
        raise PreflightError("GitHub A1 artifact is expired or expiration is unknown")
    if metadata.get("size_in_bytes") != 842695:
        raise PreflightError("GitHub A1 artifact size differs from the verified source")
    if metadata.get("digest") != "sha256:" + EXPECTED_OUTER or outer_hash != EXPECTED_OUTER:
        raise PreflightError("GitHub A1 artifact digest or downloaded bytes mismatch")
    run = metadata.get("workflow_run") or {}
    if str(run.get("id")) != EXPECTED_RUN_ID:
        raise PreflightError("A1 artifact workflow run ID mismatch")
    if run.get("head_sha") != EXPECTED_A1_COMMIT or run.get("head_branch") != "development":
        raise PreflightError("A1 artifact source commit/branch mismatch")
    return {
        "artifact_id": str(metadata["id"]),
        "artifact_name": metadata.get("name"),
        "outer_archive_sha256": outer_hash,
        "size_in_bytes": metadata["size_in_bytes"],
        "expired": metadata["expired"],
        "workflow_run_id": str(run["id"]),
        "source_commit": run["head_sha"],
        "source_branch": run["head_branch"],
        "artifact_digest": metadata["digest"],
        "expires_at": metadata.get("expires_at"),
    }


def verify_archive_bytes(raw_zip: bytes, metadata: dict | None = None) -> dict:
    outer_hash = sha256_bytes(raw_zip)
    if outer_hash != EXPECTED_OUTER:
        raise PreflightError("A1 outer archive SHA-256 mismatch")
    if metadata is not None:
        source_metadata = verify_github_artifact_metadata(metadata, outer_hash)
    else:
        source_metadata = {
            "artifact_id": EXPECTED_ARTIFACT_ID,
            "workflow_run_id": EXPECTED_RUN_ID,
            "outer_archive_sha256": outer_hash,
            "provenance": "local bytes match the pinned GitHub artifact digest; metadata not fetched in local static test",
        }
    try:
        zf = zipfile.ZipFile(io.BytesIO(raw_zip))
        names = set(zf.namelist())
        if names != {ARCHIVE_NAME, ARCHIVE_SIDECAR}:
            raise PreflightError("outer ZIP member set differs from the pinned A1 artifact")
        inner = zf.read(ARCHIVE_NAME)
        sidecar = zf.read(ARCHIVE_SIDECAR).decode("utf-8").split()
    except (zipfile.BadZipFile, KeyError, UnicodeDecodeError) as exc:
        raise PreflightError(f"outer archive structure is invalid: {exc}") from exc
    inner_hash = sha256_bytes(inner)
    if inner_hash != EXPECTED_INNER or not sidecar or sidecar[0] != EXPECTED_INNER:
        raise PreflightError("embedded A1 archive SHA-256 or sidecar mismatch")
    try:
        tf = tarfile.open(fileobj=io.BytesIO(inner), mode="r:gz")
        members = {_normalize_member(member.name): member for member in tf.getmembers() if member.isfile()}
        sums_names = [name for name in members if name == "SHA256SUMS"]
        if len(sums_names) != 1:
            raise PreflightError("embedded A1 archive must have one SHA256SUMS")
        sums_raw = tf.extractfile(members["SHA256SUMS"]).read()
        if sha256_bytes(sums_raw) != "4723788c74e4be0717edebe0851840a66e3d62d9bf6a0afb6eb7631cf6d5c201":
            raise PreflightError("A1 SHA256SUMS file hash mismatch")
        checks = {}
        for line in sums_raw.decode("utf-8").splitlines():
            if not line.strip():
                continue
            digest, filename = line.split(None, 1)
            filename = _normalize_member(filename.strip().lstrip("*"))
            if filename in checks:
                raise PreflightError(f"duplicate A1 checksum entry: {filename}")
            checks[filename] = digest
        if len(checks) != 160:
            raise PreflightError(f"expected 160 A1 checksums, found {len(checks)}")
        for name, digest in checks.items():
            if name not in members:
                raise PreflightError(f"SHA256SUMS entry is missing from A1 archive: {name}")
            actual = sha256_bytes(tf.extractfile(members[name]).read())
            if actual != digest:
                raise PreflightError(f"A1 member checksum mismatch: {name}")
        unlisted = {name: sha256_bytes(tf.extractfile(member).read())
                    for name, member in members.items() if name not in checks and name != "SHA256SUMS"}
        if unlisted != {"evidence-index.json": "2d355d9697d0a43ae36029ade1deb276e01137ef7386806a5831a6dc6e59994f"}:
            raise PreflightError("unexpected unlisted A1 archive members")
        files = {name: tf.extractfile(member).read() for name, member in members.items()}
    except (tarfile.TarError, UnicodeDecodeError, ValueError) as exc:
        raise PreflightError(f"embedded A1 archive structure is invalid: {exc}") from exc
    if len(files) < 160:
        raise PreflightError("A1 archive member count is unexpectedly small")
    source_manifest_raw = (PROOF_DIR / "proof-evidence-manifest.json").read_bytes()
    if sha256_bytes(source_manifest_raw) != EXPECTED_PROOF_MANIFEST:
        raise PreflightError("accepted #6 exact-proof manifest hash mismatch")
    proof_manifest = json.loads(source_manifest_raw)
    if proof_manifest["immutable_source"]["outer_zip_sha256"] != EXPECTED_OUTER:
        raise PreflightError("exact-proof manifest outer A1 hash mismatch")
    if proof_manifest["immutable_source"]["internal_archive_sha256"] != EXPECTED_INNER:
        raise PreflightError("exact-proof manifest internal A1 hash mismatch")
    if proof_manifest["immutable_source"]["workflow_id"] != EXPECTED_RUN_ID:
        raise PreflightError("exact-proof manifest A1 workflow ID mismatch")
    proof_hashes = {}
    for relative, expected in proof_manifest["analysis_artifacts"].items():
        path = PROOF_DIR / relative
        actual = sha256_file(path)
        if actual != expected:
            raise PreflightError(f"accepted proof source hash mismatch: {relative}")
        proof_hashes[relative] = actual
    if sha256_file(PROOF_DIR / "proof-evidence-manifest.json") != EXPECTED_PROOF_MANIFEST:
        raise PreflightError("accepted proof manifest changed during validation")
    proof_results = json.loads((PROOF_DIR / "proof-results.json").read_text(encoding="utf-8"))
    archived_results_raw = files.get("a1-qualification-results.json")
    if archived_results_raw is None:
        raise PreflightError("A1 qualification result record is missing from the verified archive")
    archived_results = json.loads(archived_results_raw.decode("utf-8"))
    spec = importlib.util.spec_from_file_location("a2_03b_exact_proof", PROOF_DIR / "exact_proof.py")
    if spec is None or spec.loader is None:
        raise PreflightError("cannot load accepted exact-proof verifier")
    proof_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(proof_module)
    verified_fixtures = {}
    for fixture_id in FIXTURES:
        data = proof_module.verify_fixture_inputs(files, archived_results, fixture_id)
        if data["hashes"]["model_matrix_sha256"] != MATRIX_HASHES[fixture_id]:
            raise PreflightError(f"fixture model-matrix hash mismatch: {fixture_id}")
        if data["columns"] != EXPECTED_COLUMNS:
            raise PreflightError(f"fixture model-matrix ordered columns mismatch: {fixture_id}")
        verified_fixtures[fixture_id] = data
    if verified_fixtures[FIXTURES[0]]["record"]["expected_separation"] != "COMPLETE_SEPARATION":
        raise PreflightError("fixture 31 proof record does not match its frozen class")
    if verified_fixtures[FIXTURES[1]]["record"]["expected_separation"] != "OVERLAP_FINITE_MLE":
        raise PreflightError("fixture 33 proof record does not match its frozen class")
    return {
        "outer_sha256": outer_hash,
        "internal_sha256": inner_hash,
        "sha256sums_verified_entries": len(checks),
        "matrix_sha256": MATRIX_HASHES,
        "proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
        "proof_analysis_artifact_sha256": proof_hashes,
        "github_source": source_metadata,
        "files": files,
        "proof_manifest": proof_manifest,
        "proof_results": proof_results,
        "a1_results": archived_results,
        "fixtures": verified_fixtures,
        "proof_module": proof_module,
    }


def signed_margins_exact(matrix_rows, response, columns, beta):
    margins = []
    for row, y in zip(matrix_rows, response):
        dot = sum((fractions.Fraction(row[col]) * coef for col, coef in zip(columns, beta)), fractions.Fraction(0))
        margins.append((1 if y == 1 else -1) * dot)
    return margins


def witness_class(problem, margins, beta):
    if margins is None or beta is None or not any(beta):
        return "NO_POSITIVE_WITNESS_RETURNED"
    if problem == "complete_margin_A":
        return "COMPLETE_WITNESS_VERIFIED" if all(m > 0 for m in margins) else "NO_POSITIVE_WITNESS_RETURNED"
    return "WEAK_WITNESS_VERIFIED" if all(m >= 0 for m in margins) and any(m > 0 for m in margins) else "NO_POSITIVE_WITNESS_RETURNED"


def confidence_for_signal(signal, witness_verified):
    if signal is None:
        return "UNMEASURED"
    return "ABOVE_FIXED_FLOOR" if signal > MARGIN_FLOOR else "AT_OR_BELOW_FIXED_FLOOR"


def classify_solver_status(status, success):
    if status != 0 or success is not True:
        return "SOLVER_EXECUTION_FAILED"
    return "SOLVER_STATUS_OPTIMAL_UNVERIFIED"


def dual_kkt_interpretation(fields):
    available = [v for v in fields.values() if v is not None]
    nonfinite = []
    missing = []
    def visit(name, value):
        if value is None:
            missing.append(name)
        elif isinstance(value, (float, int)) and not math.isfinite(float(value)):
            nonfinite.append(name)
        elif isinstance(value, dict):
            for key, nested in value.items():
                visit(f"{name}.{key}", nested)
        elif isinstance(value, (list, tuple)):
            for index, nested in enumerate(value):
                visit(f"{name}[{index}]", nested)
    for name, value in fields.items():
        visit(name, value)
    return {
        "dual_kkt_status": "UNVERIFIED",
        "independent_optimality_verification": "UNVERIFIED",
        "numerical_negative_separation_certificate": False,
        "available_dual_field_count": len(available),
        "missing_fields": missing,
        "missing_or_nonfinite_fields": nonfinite,
    }


def independent_primal_diagnostics(A, b, x, bounds):
    if x is None:
        return {"status": "UNMEASURED", "reason": "solver returned no coefficient vector"}
    if len(A) != len(b) or len(x) != len(bounds) or any(len(row) != len(x) for row in A):
        return {
            "status": "UNMEASURED",
            "reason": "solver vector or inequality dimensions do not match the encoded LP",
        }
    row_records = []
    for i, (row, rhs) in enumerate(zip(A, b)):
        products = [float(a) * float(xj) for a, xj in zip(row, x)]
        lhs = sum(products)
        signed_residual = lhs - float(rhs)
        raw = max(0.0, signed_residual)
        denominator = max(1.0, sum(abs(v) for v in products) + abs(float(rhs)))
        row_records.append({
            "row_index": i,
            "lhs_minus_rhs": signed_residual,
            "raw_violation": raw,
            "normalizer": denominator,
            "normalized_violation": raw / denominator,
        })
    bound_records = []
    for j, (xj, bound) in enumerate(zip(x, bounds)):
        lower, upper = bound
        xj = float(xj)
        if lower is not None and math.isfinite(float(lower)):
            value = float(lower)
            raw = max(0.0, value - xj)
            den = max(1.0, abs(xj), abs(value))
            bound_records.append({
                "variable_index": j, "bound_type": "lower", "bound": value,
                "raw_violation": raw, "normalizer": den, "normalized_violation": raw / den,
            })
        if upper is not None and math.isfinite(float(upper)):
            value = float(upper)
            raw = max(0.0, xj - value)
            den = max(1.0, abs(xj), abs(value))
            bound_records.append({
                "variable_index": j, "bound_type": "upper", "bound": value,
                "raw_violation": raw, "normalizer": den, "normalized_violation": raw / den,
            })
    max_raw_row = max((r["raw_violation"] for r in row_records), default=0.0)
    max_norm_row = max((r["normalized_violation"] for r in row_records), default=0.0)
    max_raw_bound = max((r["raw_violation"] for r in bound_records), default=0.0)
    max_norm_bound = max((r["normalized_violation"] for r in bound_records), default=0.0)
    return {
        "status": "MEASURED",
        "inequality_rows": row_records,
        "bound_rows": bound_records,
        "maximum_raw_inequality_violation": max_raw_row,
        "maximum_normalized_inequality_violation": max_norm_row,
        "maximum_raw_bound_violation": max_raw_bound,
        "maximum_normalized_bound_violation": max_norm_bound,
        "registered_normalized_inequality_limit": MAX_NORM_VIOLATION,
        "registered_normalized_bound_limit": MAX_NORM_VIOLATION,
        "within_registered_normalized_limits": max(max_norm_row, max_norm_bound) <= MAX_NORM_VIOLATION,
        "raw_values_have_no_separate_acceptance_threshold": True,
    }


def repeat_metric(f1, f2):
    if f1 is None or f2 is None or not math.isfinite(float(f1)) or not math.isfinite(float(f2)):
        return None
    return abs(float(f1) - float(f2)) / max(1.0, abs(float(f1)), abs(float(f2)))


def compare_repeat_records(first, second):
    f1 = first.get("registered_maximization_objective")
    f2 = second.get("registered_maximization_objective")
    ratio = repeat_metric(f1, f2)
    statuses_match = (
        first.get("solver_status", {}).get("status") == second.get("solver_status", {}).get("status")
        and first.get("solver_status", {}).get("success") == second.get("solver_status", {}).get("success")
    )
    classes_match = first.get("exact_mathematical_witness_status") == second.get("exact_mathematical_witness_status")
    if ratio is None:
        decision = "UNMEASURED"
    elif ratio <= REPEAT_LIMIT and statuses_match and classes_match:
        decision = "REPEATABILITY_WITHIN_REGISTERED_LIMIT"
    else:
        decision = "SOLVER_DISAGREEMENT"
    return {
        "first_objective": f1,
        "second_objective": f2,
        "normalized_difference": ratio,
        "formula": "abs(f1-f2) / max(1,abs(f1),abs(f2))",
        "registered_maximum": REPEAT_LIMIT,
        "statuses_match": statuses_match,
        "exact_witness_classes_match": classes_match,
        "decision": decision,
    }


def _control(control_id, category, passed, expected, observed):
    return {
        "control_id": control_id,
        "category": category,
        "status": "PASS" if passed else "FAIL",
        "expected_detection": expected,
        "observed": observed,
    }


def verifier_rejects(files, proof_results, fixture_id, exact_module):
    try:
        exact_module.verify_fixture_inputs(files, proof_results, fixture_id)
    except Exception:
        return True
    return False


def run_falsification_controls(data: dict, archive_hash_before: str, proof_manifest_hash_before: str):
    f31 = data["fixtures"][FIXTURES[0]]
    f33 = data["fixtures"][FIXTURES[1]]
    proof = data["a1_results"]
    exact_proof_results = data["proof_results"]
    exact = data["proof_module"]
    records = []

    corrupted = bytearray(data["files"]["model-matrices/" + FIXTURES[0] + ".csv"])
    corrupted[-2] = ord("0") if corrupted[-2] != ord("0") else ord("1")
    mutated_files = dict(data["files"])
    mutated_files["model-matrices/" + FIXTURES[0] + ".csv"] = bytes(corrupted)
    f01_rejected = verifier_rejects(mutated_files, proof, FIXTURES[0], exact)
    records.append(_control("F-01", "evidence_integrity",
        sha256_bytes(bytes(corrupted)) != MATRIX_HASHES[FIXTURES[0]] and f01_rejected,
        "Mutated decimal token or identity is rejected by SHA/schema checks",
        {"mutated_sha256": sha256_bytes(bytes(corrupted)), "expected_sha256": MATRIX_HASHES[FIXTURES[0]],
         "accepted_proof_verifier_rejected": f01_rejected}))

    response = list(f31["response"])
    response[0] = 1 - response[0]
    response_text = [str(v) for v in response]
    altered_response_sha = sha256_bytes("\n".join(response_text).encode())
    input_path = "fixtures/" + FIXTURES[0] + ".csv"
    input_lines = data["files"][input_path].decode("utf-8").splitlines()
    first_values = input_lines[1].split(",")
    first_values[1] = "0" if first_values[1] == "1" else "1"
    input_lines[1] = ",".join(first_values)
    mutated_files = dict(data["files"])
    mutated_files[input_path] = ("\n".join(input_lines) + "\n").encode()
    archive_unchanged = archive_hash_before == data["outer_sha256"]
    proof_unchanged = proof_manifest_hash_before == sha256_file(PROOF_DIR / "proof-evidence-manifest.json")
    f02_rejected = verifier_rejects(mutated_files, proof, FIXTURES[0], exact)
    records.append(_control("F-02", "evidence_integrity",
        altered_response_sha != f31["record"]["response_sha256"] and f02_rejected and archive_unchanged and proof_unchanged,
        "Changed response linkage is rejected by its pinned response hash",
        {"mutated_response_sha256": altered_response_sha, "expected_sha256": f31["record"]["response_sha256"],
         "accepted_proof_verifier_rejected": f02_rejected, "source_archive_unchanged": archive_unchanged,
         "proof_manifest_unchanged": proof_unchanged}))

    witness31 = [fractions.Fraction(0), fractions.Fraction(1), fractions.Fraction(0)]
    min_row = exact_proof_results["fixture_31"]["minimum_margin"]["row_id"]
    min_index = f31["row_ids"].index(min_row)
    reversed_y = list(f31["response"])
    reversed_y[min_index] = 1 - reversed_y[min_index]
    changed_margins = signed_margins_exact(f31["matrix_rows"], reversed_y, f31["columns"], witness31)
    records.append(_control("F-03", "mathematical_witness_failure",
        changed_margins[min_index] < 0,
        "Reversing the minimum-margin row response makes the frozen witness invalid on the copy",
        {"row_id": min_row, "mutated_margin": frac_record(changed_margins[min_index])}))

    zero_beta = [fractions.Fraction(0)] * len(f31["columns"])
    zero_margins = signed_margins_exact(f31["matrix_rows"], f31["response"], f31["columns"], zero_beta)
    records.append(_control("F-04", "mathematical_witness_failure",
        witness_class("complete_margin_A", zero_margins, zero_beta) != "COMPLETE_WITNESS_VERIFIED",
        "A zeroed/corrupted witness is rejected",
        {"witness_class": witness_class("complete_margin_A", zero_margins, zero_beta)}))

    fewer_rows = f31["matrix_rows"][:-1]
    mutated_files = dict(data["files"])
    for path in ("fixtures/" + FIXTURES[0] + ".csv", "model-matrices/" + FIXTURES[0] + ".csv"):
        lines = data["files"][path].decode("utf-8").splitlines()
        mutated_files[path] = ("\n".join(lines[:-1]) + "\n").encode()
    f05_rejected = verifier_rejects(mutated_files, proof, FIXTURES[0], exact)
    records.append(_control("F-05", "evidence_integrity",
        (len(fewer_rows) != f31["record"]["sample_size"] or len(fewer_rows) != len(f31["row_ids"])) and f05_rejected,
        "An omitted observation is rejected by row-count/order checks",
        {"mutated_row_count": len(fewer_rows), "expected_row_count": f31["record"]["sample_size"],
         "accepted_proof_verifier_rejected": f05_rejected}))

    anchor = data["proof_results"]["fixture_33"]["common_anchor_groups"][0]
    control_id = anchor["control_row_ids"][0]
    treated_id = anchor["treated_row_ids"][0]
    rows33 = copy.deepcopy(f33["matrix_rows"])
    treated_row = next(row for row in rows33 if row["row_id"] == treated_id)
    treated_row["x1"] = "0.125"
    control_row = next(row for row in rows33 if row["row_id"] == control_id)
    records.append(_control("F-06", "mathematical_proof_precondition",
        treated_row["x1"] != control_row["x1"],
        "Mutating one anchor matrix token breaks exact row equality",
        {"control_row_id": control_id, "treated_row_id": treated_id, "rows_equal": treated_row == control_row}))

    y33 = dict(zip(f33["row_ids"], f33["response"]))
    y33[treated_id] = 1 - y33[treated_id]
    records.append(_control("F-07", "evidence_integrity",
        y33[treated_id] == y33[control_id],
        "Changing one response association invalidates the opposite-treatment anchor condition",
        {"control_treatment": y33[control_id], "treated_treatment_after_mutation": y33[treated_id]}))

    anchor_groups = data["proof_results"]["fixture_33"]["common_anchor_groups"]
    removed = {anchor_groups[0]["control_row_ids"][0], anchor_groups[0]["treated_row_ids"][0]}
    matrix33 = exact.matrix_fractions(f33)
    remaining_full = [row for rid, row in zip(f33["row_ids"], matrix33) if rid not in removed]
    remaining_anchor = []
    for group in anchor_groups[1:]:
        rid = group["control_row_ids"][0]
        remaining_anchor.append(matrix33[f33["row_ids"].index(rid)])
    full_rank = exact.exact_rank(remaining_full, 3)["rank"]
    anchor_rank = exact.exact_rank(remaining_anchor, 3)["rank"]
    records.append(_control("F-08", "mathematical_proof_precondition",
        anchor_rank < full_rank,
        "Removing one essential anchor pair invalidates the original full-rank spanning certificate",
        {"remaining_anchor_rank": anchor_rank, "mutated_full_design_rank": full_rank}))

    wrong_columns = list(f33["columns"])
    wrong_columns[1], wrong_columns[2] = wrong_columns[2], wrong_columns[1]
    matrix_path33 = "model-matrices/" + FIXTURES[1] + ".csv"
    mutated_files = dict(data["files"])
    matrix_lines = data["files"][matrix_path33].decode("utf-8").splitlines()
    # The frozen CSV writer quotes every header field.  Mutate those exact
    # tokens so this control actually changes the archived column identity.
    matrix_lines[0] = matrix_lines[0].replace('"x1","x2"', '"x2","x1"')
    mutated_files[matrix_path33] = ("\n".join(matrix_lines) + "\n").encode()
    f09_rejected = verifier_rejects(mutated_files, proof, FIXTURES[1], exact)
    records.append(_control("F-09", "evidence_integrity",
        wrong_columns != EXPECTED_COLUMNS and f09_rejected,
        "Changed column order/identity is rejected before proof attribution",
        {"mutated_columns": wrong_columns, "expected_columns": EXPECTED_COLUMNS,
         "accepted_proof_verifier_rejected": f09_rejected}))

    bad_beta = [fractions.Fraction(0), fractions.Fraction(-1), fractions.Fraction(0)]
    bad_margins = signed_margins_exact(f31["matrix_rows"], f31["response"], f31["columns"], bad_beta)
    records.append(_control("F-10", "mathematical_witness_failure",
        witness_class("complete_margin_A", bad_margins, bad_beta) != "COMPLETE_WITNESS_VERIFIED",
        "A synthetic coefficient vector with a signed-margin violation is rejected",
        {"minimum_signed_margin": frac_record(min(bad_margins))}))

    statuses = [1, 2, 3, 4, None]
    status_results = [classify_solver_status(status, False) for status in statuses]
    records.append(_control("F-11", "solver_result_validation",
        all(value == "SOLVER_EXECUTION_FAILED" for value in status_results),
        "Limits, infeasible/unbounded/error and missing status are not accepted as optimal",
        {"statuses": statuses, "mapped": status_results}))

    residual = independent_primal_diagnostics([[1.0]], [0.0], [1e-7], [(0.0, 1.0)])
    records.append(_control("F-12", "solver_result_validation",
        residual["maximum_normalized_inequality_violation"] > MAX_NORM_VIOLATION
        and not residual["within_registered_normalized_limits"],
        "A synthetic normalized primal violation above the registered limit is not accepted",
        {"maximum_normalized_inequality_violation": residual["maximum_normalized_inequality_violation"]}))

    small_signal = fractions.Fraction(1, 10**10)
    confidence = confidence_for_signal(small_signal, True)
    records.append(_control("F-13", "numerical_confidence",
        confidence == "AT_OR_BELOW_FIXED_FLOOR" and witness_class("complete_margin_A", [small_signal], [small_signal]) == "COMPLETE_WITNESS_VERIFIED",
        "A small exact positive witness remains mathematically positive below the reporting floor",
        {"exact_signal": frac_record(small_signal), "confidence": confidence, "exact_witness_retained": True}))

    dual = dual_kkt_interpretation({"inequality_marginals": None, "lower_marginals": float("nan"), "upper_marginals": None})
    records.append(_control("F-14", "numerical_confidence",
        dual["dual_kkt_status"] == "UNVERIFIED" and not dual["numerical_negative_separation_certificate"],
        "Missing/non-finite dual diagnostics cannot support a negative separation certificate",
        dual))

    close = repeat_metric(1e-10, 2e-10)
    conflict = repeat_metric(0.0, 2e-8)
    class_conflict = compare_repeat_records(
        {"registered_maximization_objective": 0.0, "solver_status": {"status": 0, "success": True},
         "exact_mathematical_witness_status": "NO_POSITIVE_WITNESS_RETURNED"},
        {"registered_maximization_objective": 0.0, "solver_status": {"status": 0, "success": True},
         "exact_mathematical_witness_status": "WEAK_WITNESS_VERIFIED"},
    )
    records.append(_control("F-15", "repeatability",
        close is not None and close <= REPEAT_LIMIT and conflict is not None and conflict > REPEAT_LIMIT
        and class_conflict["decision"] == "SOLVER_DISAGREEMENT",
        "The fixed metric and exact-class comparison detect disagreement without choosing a repeat",
        {"small_objective_ratio": close, "conflicting_objective_ratio": conflict,
         "exact_class_conflict_decision": class_conflict["decision"], "limit": REPEAT_LIMIT}))

    if len(records) != 15:
        raise PreflightError("falsification harness did not execute exactly fifteen controls")
    return {
        "schema": "CP-STAT-02-A2-03B-FALSIFICATION-REPORT-v1",
        "registered_controls": 15,
        "executed_controls": 15,
        "controls": records,
        "all_controls_passed": all(row["status"] == "PASS" for row in records),
        "source_archive_sha256_after_controls": archive_hash_before,
        "proof_manifest_sha256_after_controls": proof_manifest_hash_before,
    }


def registered_solver_options(method: str) -> dict:
    contract = load_json(CONTRACT_PATH)
    shared = contract["solver_options"]["shared"]
    options = {
        "primal_feasibility_tolerance": shared["primal_feasibility_tolerance"],
        "dual_feasibility_tolerance": shared["dual_feasibility_tolerance"],
        "presolve": shared["presolve"],
        "maxiter": shared["maxiter"],
        "time_limit": shared["time_limit_seconds"],
        "disp": shared["disp"],
    }
    if method == "highs-ds":
        if contract["solver_options"]["highs_ds"]["method"] != method:
            raise PreflightError("dual-simplex method differs from the immutable v1 contract")
    elif method == "highs-ipm":
        ipm_tolerance = contract["solver_options"]["highs_ipm"]["ipm_optimality_tolerance"]
        if contract["solver_options"]["highs_ipm"]["method"] != method:
            raise PreflightError("IPM method differs from the immutable v1 contract")
        options["ipm_optimality_tolerance"] = ipm_tolerance
    else:
        raise PreflightError(f"unregistered solver method: {method}")
    return options


def check_lp_construction(data, np):
    """Validate frozen LP arrays and options without invoking linprog."""
    cells = load_json(MANIFEST_PATH)["cells"]
    checked = []
    for cell in cells:
        problem = create_problem(data, cell, np)
        fixture = data["fixtures"][cell["fixture_id"]]
        n = len(fixture["response"])
        p = len(EXPECTED_COLUMNS)
        A = problem["A_ub"]
        b = problem["b_ub"]
        c = problem["c"]
        if A.shape != (n, p + (cell["problem"] == "complete_margin_A")):
            raise PreflightError(f"LP inequality matrix has unexpected shape in {cell['cell_id']}")
        if b.shape != (n,) or c.shape != (A.shape[1],):
            raise PreflightError(f"LP vector shape mismatch in {cell['cell_id']}")
        if not (np.all(np.isfinite(A)) and np.all(np.isfinite(b)) and np.all(np.isfinite(c))):
            raise PreflightError(f"LP contains non-finite input in {cell['cell_id']}")
        Z = problem["Z_representation"]
        expected_A = np.column_stack((-Z, np.ones(n))) if cell["problem"] == "complete_margin_A" else -Z
        expected_c = np.zeros(p + 1) if cell["problem"] == "complete_margin_A" else -np.sum(Z, axis=0)
        if cell["problem"] == "complete_margin_A":
            expected_c[-1] = -1.0
            expected_bounds = [(-1.0, 1.0)] * p + [(0.0, None)]
        else:
            expected_bounds = [(-1.0, 1.0)] * p
        if not np.array_equal(A, expected_A) or not np.array_equal(b, np.zeros(n)):
            raise PreflightError(f"LP inequality encoding differs from preregistration in {cell['cell_id']}")
        if not np.array_equal(c, expected_c) or problem["bounds"] != expected_bounds:
            raise PreflightError(f"LP objective or variable bounds differ from preregistration in {cell['cell_id']}")
        options = registered_solver_options(cell["method"])
        expected_keys = {
            "primal_feasibility_tolerance", "dual_feasibility_tolerance", "presolve",
            "maxiter", "time_limit", "disp",
        }
        if cell["method"] == "highs-ipm":
            expected_keys.add("ipm_optimality_tolerance")
        if set(options) != expected_keys:
            raise PreflightError(f"solver option set differs from frozen v1 in {cell['cell_id']}")
        checked.append(cell["cell_id"])
    if len(checked) != 32:
        raise PreflightError("LP construction check did not cover all 32 manifest rows")
    return {
        "status": "PASS",
        "manifest_rows_checked_without_solver": len(checked),
        "lp_arrays_and_bounds_checked": True,
        "registered_options_checked": True,
        "linprog_calls": 0,
    }


def static_checks(data, require_frozen=True):
    checked = verify_frozen_files() if require_frozen else {
        "status": "NOT_REQUIRED_FOR_INITIAL_AUTHORING"
    }
    manifest = verify_manifest()
    source = pathlib.Path(__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)
    call_sites = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Name)
        and node.func.id == "linprog"
    ]
    if len(call_sites) != 1:
        raise PreflightError("implementation must contain exactly one linprog invocation site")
    if len(expected_manifest_rows()) != 32:
        raise PreflightError("generated call matrix is not exactly 32 cells")
    import numpy as np
    lp_construction = check_lp_construction(data, np)
    check_descriptions = [
        "Python AST parse",
        "exact ordered 32-cell manifest check",
        "all 32 LP array/objective/bound constructions checked without linprog",
        "registered method-specific option sets checked against the immutable v1 contract",
        "one solver invocation site check",
    ]
    if require_frozen:
        check_descriptions.insert(1, "frozen file SHA-256 checks")
    return {
        "status": "PASS",
        "frozen_files": checked,
        "manifest": manifest,
        "solver_invocation_sites": 1,
        "falsification_solver_calls": 0,
        "static_checks": check_descriptions,
        "lp_construction": lp_construction,
    }


def parse_install_report(path: pathlib.Path):
    report = load_json(path)
    installs = report.get("install")
    if not isinstance(installs, list):
        raise PreflightError("pip install report has no installation list")
    observed = {}
    for item in installs:
        meta = item.get("metadata", {})
        name = str(meta.get("name", "")).lower().replace("_", "-")
        if name in observed:
            raise PreflightError(f"duplicate package entry in pip report: {name}")
        observed[name] = item
    if set(observed) != set(WHEEL_PINS):
        raise PreflightError("pip report package set differs from exact three-wheel lock")
    records = {}
    for name, (version, expected_hash) in WHEEL_PINS.items():
        item = observed[name]
        actual_version = item.get("metadata", {}).get("version")
        actual_hash = item.get("download_info", {}).get("archive_info", {}).get("hashes", {}).get("sha256")
        if actual_version != version or actual_hash != expected_hash:
            raise PreflightError(f"pinned wheel version/hash mismatch for {name}")
        records[name] = {
            "version": actual_version,
            "wheel_sha256": actual_hash,
            "download_url": item.get("download_info", {}).get("url"),
        }
    return records


def verify_python_build_manifest():
    url = (
        "https://raw.githubusercontent.com/actions/python-versions/"
        + PYTHON_VERSIONS_MANIFEST_COMMIT
        + "/versions-manifest.json"
    )
    request = urllib.request.Request(url, headers={"User-Agent": "ClinicalPSM-A2-03B-forensics"})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read()
    manifest = json.loads(raw.decode("utf-8"))
    releases = [item for item in manifest if item.get("version") == "3.13.17"]
    matches = [
        file for release in releases for file in release.get("files", [])
        if file.get("platform") == "linux"
        and file.get("platform_version") == "24.04"
        and file.get("arch") == "x64"
    ]
    if len(matches) != 1:
        raise PreflightError("pinned Python build manifest does not identify exactly one Ubuntu 24.04 x86_64 runtime")
    selected = matches[0]
    if selected.get("filename") != "python-3.13.17-linux-24.04-x64.tar.gz":
        raise PreflightError("pinned Python build manifest filename differs from the frozen runtime")
    if selected.get("download_url") != PYTHON_RELEASE_URL:
        raise PreflightError("pinned Python build manifest release URL differs from the frozen runtime")
    cache_hit = os.environ.get("SETUP_PYTHON_CACHE_HIT", "").lower()
    if cache_hit not in ("true", "false"):
        raise PreflightError("actions/setup-python cache/download provenance output is missing or unknown")
    return {
        "repository": "actions/python-versions",
        "commit": PYTHON_VERSIONS_MANIFEST_COMMIT,
        "manifest_url": url,
        "manifest_sha256": sha256_bytes(raw),
        "selected_release_version": "3.13.17",
        "selected_filename": selected["filename"],
        "selected_download_url": selected["download_url"],
        "setup_python_cache_hit": cache_hit,
        "provenance_interpretation": (
            "runner image/tool cache, identified by ImageVersion and executable SHA-256"
            if cache_hit == "true"
            else "downloaded by the pinned setup-python action from the selected immutable official release URL"
        ),
    }


def collect_environment(pip_report_path: pathlib.Path):
    import numpy as np
    import scipy

    version = sys.version_info
    if tuple(version[:3]) != (3, 13, 17) or platform.python_implementation() != "CPython":
        raise PreflightError("runtime is not the locked CPython 3.13.17")
    if platform.system() != "Linux" or platform.machine().lower() not in ("x86_64", "amd64"):
        raise PreflightError("runtime is not Linux x86_64")
    if platform.architecture()[0] != "64bit":
        raise PreflightError("Python runtime is not 64-bit")
    os_release = pathlib.Path("/etc/os-release").read_text(encoding="utf-8")
    if 'VERSION_ID="24.04"' not in os_release and "VERSION_ID=24.04" not in os_release:
        raise PreflightError("runtime operating system is not Ubuntu 24.04")
    image_os = os.environ.get("ImageOS")
    image_version = os.environ.get("ImageVersion")
    if not image_os or not image_version:
        raise PreflightError("GitHub runner ImageOS/ImageVersion provenance is missing")
    setup_path = os.environ.get("SETUP_PYTHON_PATH")
    if not setup_path:
        raise PreflightError("actions/setup-python executable output is missing")
    expected_path = pathlib.Path(setup_path).resolve()
    actual_path = pathlib.Path(sys.executable).resolve()
    if expected_path != actual_path:
        raise PreflightError("active interpreter differs from actions/setup-python output")
    if os.environ.get("SETUP_PYTHON_VERSION") != "3.13.17":
        raise PreflightError("actions/setup-python version output is not 3.13.17")
    if not actual_path.is_file():
        raise PreflightError("resolved Python executable is not a file")
    python_manifest = verify_python_build_manifest()
    package_records = {
        "python": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
            "version_verbose": sys.version,
            "executable_reported": sys.executable,
            "executable_realpath": str(actual_path),
            "executable_sha256": sha256_file(actual_path),
            "executable_size_bytes": actual_path.stat().st_size,
            "python_build": platform.python_build(),
            "python_compiler": platform.python_compiler(),
            "soabi": sysconfig.get_config_var("SOABI"),
            "cache_hit": os.environ.get("SETUP_PYTHON_CACHE_HIT"),
            "setup_action_commit": "6d4fd22b20465ccc0f7354476588e8df7c9ca0e0",
            "setup_action_output_path": os.environ.get("SETUP_PYTHON_PATH"),
            "runner_tool_cache": os.environ.get("RUNNER_TOOL_CACHE"),
            "python_location_environment": os.environ.get("pythonLocation"),
        },
        "numpy": {"version": np.__version__},
        "scipy": {"version": scipy.__version__},
    }
    for package in ("numpy", "scipy"):
        expected = WHEEL_PINS[package][0]
        if package_records[package]["version"] != expected:
            raise PreflightError(f"installed {package} version mismatch")
    wheel_records = parse_install_report(pip_report_path)
    for name, record in wheel_records.items():
        package_records.setdefault(name, {}).update(record)
    wrapper = importlib.util.find_spec("scipy.optimize._highs._highs_wrapper")
    if wrapper is None or not wrapper.origin:
        raise PreflightError("SciPy HiGHS wrapper binary is unavailable")
    wrapper_path = pathlib.Path(wrapper.origin)
    embedded = {
        "scipy_highs_wrapper_path": str(wrapper_path),
        "scipy_highs_wrapper_sha256": sha256_file(wrapper_path),
        "highs_version": "1.12.0",
        "highs_version_provenance": {
            "method": "exact installed SciPy wheel SHA-256 plus the preregistered SciPy 1.18.1 source commit and its pinned HiGHS subproject commit",
            "scipy_source_commit": "e4e854eaa8f18d807cd3496028e257e36caa93cc",
            "highs_subproject_commit": "4f96ee8f40b2d3a46e00d6137d5eb31044680776",
            "wheel_sha256": WHEEL_PINS["scipy"][1],
        },
    }
    try:
        constants = importlib.import_module("scipy.optimize._highs._highs_constants")
        names = ["HIGHS_VERSION_MAJOR", "HIGHS_VERSION_MINOR", "HIGHS_VERSION_PATCH"]
        if all(hasattr(constants, name) for name in names):
            direct = ".".join(str(getattr(constants, name)) for name in names)
            embedded["highs_version_runtime_export"] = direct
            if direct != "1.12.0":
                raise PreflightError("runtime-exported embedded HiGHS version is not 1.12.0")
        else:
            embedded["highs_version_runtime_export"] = "NOT_EXPOSED_BY_SCIPY"
    except ModuleNotFoundError:
        embedded["highs_version_runtime_export"] = "NOT_EXPOSED_BY_SCIPY"
    env = {
        "schema": "CP-STAT-02-A2-03B-ENVIRONMENT-v1",
        "recorded_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "github": {
            "repository": os.environ.get("GITHUB_REPOSITORY"),
            "workflow": os.environ.get("GITHUB_WORKFLOW"),
            "run_id": os.environ.get("GITHUB_RUN_ID"),
            "run_attempt": os.environ.get("GITHUB_RUN_ATTEMPT"),
            "commit_sha": os.environ.get("GITHUB_SHA"),
            "ref": os.environ.get("GITHUB_REF"),
            "runner_os": os.environ.get("RUNNER_OS"),
            "runner_arch": os.environ.get("RUNNER_ARCH"),
            "image_os": image_os,
            "image_version": image_version,
        },
        "operating_system": {
            "platform": platform.platform(),
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "libc": platform.libc_ver(),
            "os_release_text": os_release,
        },
        "packages": package_records,
        "embedded_highs": embedded,
        "python_build_provenance": python_manifest,
        "thread_environment_observed": {
            key: os.environ.get(key) for key in ["OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS", "VECLIB_MAXIMUM_THREADS"]
        },
        "locked_inputs": {
            "python_source_archive_sha256": "6020bd10aff3bf4821be16f088ebb1591beb7b811dcd8fab1da8f7c22a7b27e7",
            "pip_version": "26.2.2",
            "numpy_version": "2.5.4",
            "scipy_version": "1.18.1",
            "highs_version": "1.12.0",
        },
    }
    return env


def download_original_artifact(token: str, repo: str, destination: pathlib.Path):
    base = f"https://api.github.com/repos/{repo}/actions/artifacts/{EXPECTED_ARTIFACT_ID}"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "ClinicalPSM-A2-03B-forensics",
    }
    req = urllib.request.Request(base, headers=headers)
    with urllib.request.urlopen(req, timeout=45) as response:
        metadata = json.loads(response.read().decode("utf-8"))
    verify_github_artifact_metadata(metadata, EXPECTED_OUTER)
    zip_url = base + "/zip"
    opener = urllib.request.build_opener(_NoRedirectHandler())
    zip_req = urllib.request.Request(zip_url, headers=headers)
    try:
        response = opener.open(zip_req, timeout=45)
        raw = response.read()
    except urllib.error.HTTPError as exc:
        if exc.code not in (301, 302, 303, 307, 308):
            raise
        signed_url = exc.headers.get("Location")
        if not signed_url:
            raise PreflightError("GitHub artifact endpoint returned a redirect without a location")
        # Do not forward the GitHub token to the signed artifact host.
        with urllib.request.urlopen(urllib.request.Request(signed_url), timeout=90) as response:
            raw = response.read()
    if sha256_bytes(raw) != EXPECTED_OUTER:
        raise PreflightError("downloaded original A1 artifact bytes do not match the pinned outer SHA")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(raw)
    return metadata, raw


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def create_problem(data, cell, np):
    fixture = data["fixtures"][cell["fixture_id"]]
    rows = fixture["matrix_rows"]
    y = np.asarray(fixture["response"], dtype=np.float64)
    X = np.asarray([[float(row[col]) for col in EXPECTED_COLUMNS] for row in rows], dtype=np.float64)
    if X.shape != (len(fixture["response"]), 3) or not np.all(np.isfinite(X)):
        raise PreflightError("solver input matrix has invalid shape or non-finite values")
    scales = np.max(np.abs(X), axis=0)
    if np.any(~np.isfinite(scales)) or np.any(scales <= 0):
        raise PreflightError("column-max normalization has a zero or invalid scale")
    if cell["representation"] == "raw":
        Xrep = X.copy()
        scales_used = np.ones(X.shape[1], dtype=np.float64)
    elif cell["representation"] == "column_max_normalized":
        Xrep = X / scales
        scales_used = scales
    else:
        raise PreflightError("unknown representation in frozen manifest")
    signs = 2.0 * y - 1.0
    Z = signs[:, None] * Xrep
    if cell["problem"] == "complete_margin_A":
        A = np.column_stack((-Z, np.ones(Z.shape[0], dtype=np.float64)))
        b = np.zeros(Z.shape[0], dtype=np.float64)
        c = np.zeros(X.shape[1] + 1, dtype=np.float64)
        c[-1] = -1.0
        bounds = [(-1.0, 1.0)] * X.shape[1] + [(0.0, None)]
    else:
        A = -Z
        b = np.zeros(Z.shape[0], dtype=np.float64)
        c = -np.sum(Z, axis=0)
        bounds = [(-1.0, 1.0)] * X.shape[1]
    return {
        "X_original": X,
        "X_representation": Xrep,
        "scales": scales_used,
        "signs": signs,
        "Z_original": signs[:, None] * X,
        "Z_representation": Z,
        "A_ub": A,
        "b_ub": b,
        "c": c,
        "bounds": bounds,
    }


def scipy_fields(result):
    out = {
        "status": plain(getattr(result, "status", None)),
        "success": plain(getattr(result, "success", None)),
        "message": plain(getattr(result, "message", None)),
        "nit": plain(getattr(result, "nit", None)),
        "crossover_nit": plain(getattr(result, "crossover_nit", None)),
        "fun": plain(getattr(result, "fun", None)),
        "x": plain(getattr(result, "x", None)),
        "slack": plain(getattr(result, "slack", None)),
        "ineqlin": {},
        "lower": {},
        "upper": {},
        "eqlin": {},
    }
    for section in ("ineqlin", "lower", "upper", "eqlin"):
        record = getattr(result, section, None)
        for key in ("residual", "marginals"):
            try:
                out[section][key] = plain(getattr(record, key))
            except Exception:
                out[section][key] = None
    return out


def worker_cell(archive_path: pathlib.Path, metadata_path: pathlib.Path, cell_id: str, output_path: pathlib.Path):
    started_marker = output_path.with_suffix(".solver-call-started.json")
    cell = next((row for row in load_json(MANIFEST_PATH)["cells"] if row["cell_id"] == cell_id), None)
    if cell is None:
        raise PreflightError(f"cell is not in the frozen manifest: {cell_id}")
    metadata = load_json(metadata_path)
    data = verify_archive_bytes(archive_path.read_bytes(), metadata)
    fixture = data["fixtures"][cell["fixture_id"]]
    import numpy as np
    import scipy
    from scipy.optimize import OptimizeWarning, linprog
    if np.__version__ != WHEEL_PINS["numpy"][0] or scipy.__version__ != WHEEL_PINS["scipy"][0]:
        raise PreflightError("worker runtime package mismatch before solver call")
    problem = create_problem(data, cell, np)
    options = registered_solver_options(cell["method"])
    started_marker.write_text(json.dumps({
        "cell_id": cell_id,
        "call_marked_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "linprog_invocation_about_to_start": True,
    }) + "\n", encoding="utf-8")
    t0 = time.perf_counter()
    warning_messages = []
    try:
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always", OptimizeWarning)
            result = linprog(
                problem["c"],
                A_ub=problem["A_ub"],
                b_ub=problem["b_ub"],
                bounds=problem["bounds"],
                method=cell["method"],
                options=options,
            )
        warning_messages = [str(w.message) for w in captured]
    except Exception as exc:
        elapsed = time.perf_counter() - t0
        output = failed_call_record(cell, elapsed, type(exc).__name__ + ": " + str(exc), True, data, problem, options)
        write_json(output_path, output)
        return
    elapsed = time.perf_counter() - t0
    fields = scipy_fields(result)
    field_status = {
        "status": diagnostic_field_status(getattr(result, "status", None)),
        "success": diagnostic_field_status(getattr(result, "success", None)),
        "message": diagnostic_field_status(getattr(result, "message", None)),
        "nit": diagnostic_field_status(getattr(result, "nit", None)),
        "crossover_nit": diagnostic_field_status(getattr(result, "crossover_nit", None)),
        "fun": diagnostic_field_status(getattr(result, "fun", None)),
        "x": diagnostic_field_status(getattr(result, "x", None)),
        "slack": diagnostic_field_status(getattr(result, "slack", None)),
        "ineqlin.residual": diagnostic_field_status(getattr(getattr(result, "ineqlin", None), "residual", None)),
        "ineqlin.marginals": diagnostic_field_status(getattr(getattr(result, "ineqlin", None), "marginals", None)),
        "lower.residual": diagnostic_field_status(getattr(getattr(result, "lower", None), "residual", None)),
        "lower.marginals": diagnostic_field_status(getattr(getattr(result, "lower", None), "marginals", None)),
        "upper.residual": diagnostic_field_status(getattr(getattr(result, "upper", None), "residual", None)),
        "upper.marginals": diagnostic_field_status(getattr(getattr(result, "upper", None), "marginals", None)),
        "eqlin": "NOT_APPLICABLE_NO_EQUALITY_ROWS",
    }
    raw_x = getattr(result, "x", None)
    x = None if raw_x is None else [finite_float(v) for v in raw_x]
    if x is not None and any(v is None for v in x):
        x = None
    objective_min = finite_float(getattr(result, "fun", None))
    coefficient_vector_valid = x is not None and len(x) == len(problem["c"])
    required_numeric_fields_valid = objective_min is not None and coefficient_vector_valid
    p = problem["X_original"].shape[1]
    if x is None:
        beta_rep = None
        beta_original = None
        margins_exact = None
        witness = "UNMEASURED"
        signal = None
        numeric_original = None
        numeric_rep = None
    else:
        beta_rep = [float(v) for v in (x[:-1] if cell["problem"] == "complete_margin_A" else x)]
        beta_original = [
            beta_rep[j] / float(problem["scales"][j]) if cell["representation"] == "column_max_normalized" else beta_rep[j]
            for j in range(p)
        ]
        beta_q_rep = [exact(v) for v in beta_rep]
        if cell["representation"] == "column_max_normalized":
            beta_q = [beta_q_rep[j] / exact(float(problem["scales"][j])) for j in range(p)]
        else:
            beta_q = beta_q_rep
        margins_exact = signed_margins_exact(fixture["matrix_rows"], fixture["response"], EXPECTED_COLUMNS, beta_q)
        witness = witness_class(cell["problem"], margins_exact, beta_q)
        if margins_exact:
            signal = min(margins_exact) if cell["problem"] == "complete_margin_A" else sum(margins_exact, fractions.Fraction(0))
        else:
            signal = None
        numeric_original = (problem["Z_original"] @ np.asarray(beta_original, dtype=np.float64)).tolist()
        numeric_rep = (problem["Z_representation"] @ np.asarray(beta_rep, dtype=np.float64)).tolist()
    primal = independent_primal_diagnostics(
        problem["A_ub"].tolist(),
        problem["b_ub"].tolist(),
        x,
        problem["bounds"],
    )
    dual = dual_kkt_interpretation({
        f"{section}.{field}": fields.get(section, {}).get(field)
        for section in ("ineqlin", "lower", "upper")
        for field in ("residual", "marginals")
    })
    status = fields.get("status")
    success = fields.get("success")
    typed = classify_solver_status(status, success)
    if typed != "SOLVER_EXECUTION_FAILED" and not required_numeric_fields_valid:
        typed = "SOLVER_EXECUTION_FAILED"
    unrecognized_option_warning = any(
        "unrecognized" in message.lower() or "unknown option" in message.lower()
        for message in warning_messages
    )
    if unrecognized_option_warning:
        typed = "SOLVER_EXECUTION_FAILED"
    if typed != "SOLVER_EXECUTION_FAILED":
        if not primal.get("within_registered_normalized_limits", False):
            typed = "NUMERICAL_RESULT_INCONCLUSIVE"
        elif witness in ("COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED"):
            typed = "MATHEMATICAL_CERTIFICATE_SUPPORTED"
        else:
            typed = "NUMERICAL_RESULT_INCONCLUSIVE"
    confidence = confidence_for_signal(signal, witness in ("COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED"))
    if witness in ("COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED"):
        final_interpretation = (
            "EXACT_POSITIVE_WITNESS_VERIFIED; "
            + ("SIGNAL_ABOVE_FIXED_FLOOR" if confidence == "ABOVE_FIXED_FLOOR" else "SIGNAL_AT_OR_BELOW_FIXED_FLOOR")
            + "; OPTIMALITY_AND_DUAL_KKT_UNVERIFIED"
        )
    else:
        final_interpretation = "NO_POSITIVE_WITNESS_VERIFIED; SEPARATION_INCONCLUSIVE; DUAL_KKT_UNVERIFIED"
    objective_value = -objective_min if objective_min is not None else None
    output = {
        "schema": "CP-STAT-02-A2-03B-RAW-CELL-v1",
        "call_number": None,
        "cell_id": cell_id,
        "fixture_id": cell["fixture_id"],
        "fixture_input_hashes": {
            "outer_archive_sha256": data["outer_sha256"],
            "internal_archive_sha256": data["internal_sha256"],
            "model_matrix_sha256": fixture["hashes"]["model_matrix_sha256"],
            "response_sha256": fixture["record"]["response_sha256"],
            "row_order_sha256": fixture["record"]["row_order_sha256"],
            "exact_proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
        },
        "representation": cell["representation"],
        "method": cell["method"],
        "problem": cell["problem"],
        "repeat": cell["repeat"],
        "fresh_process": True,
        "solver_options": options,
        "objective_coefficients_c": problem["c"].tolist(),
        "A_ub": problem["A_ub"].tolist(),
        "b_ub": problem["b_ub"].tolist(),
        "variable_bounds": problem["bounds"],
        "column_max_scales": problem["scales"].tolist(),
        "solver_runtime_seconds": elapsed,
        "scipy_version": scipy.__version__,
        "scipy_result": fields,
        "solver_status": {
            "status": fields.get("status"),
            "success": fields.get("success"),
            "message": fields.get("message"),
            "nit": fields.get("nit"),
            "crossover_nit": fields.get("crossover_nit"),
        },
        "required_numeric_fields": {
            "objective_fun_status": "PRESENT_FINITE" if objective_min is not None else diagnostic_field_status(getattr(result, "fun", None)),
            "coefficient_vector_status": "PRESENT_FINITE_AND_EXPECTED_LENGTH" if coefficient_vector_valid else "UNMEASURED_MISSING_NONFINITE_OR_WRONG_LENGTH",
            "required_fields_valid_for_solver_outcome": required_numeric_fields_valid,
        },
        "warning_messages": warning_messages,
        "unrecognized_option_warning": unrecognized_option_warning,
        "unknown_or_nonfinite_fields": [
            key for key, state in field_status.items()
            if state.startswith("UNMEASURED")
        ],
        "diagnostic_field_status": field_status,
        "coefficient_vector_representation_units": beta_rep,
        "coefficient_vector_original_units": beta_original,
        "coefficient_vector_binary64_hex": [float(v).hex() for v in x] if x is not None else None,
        "registered_maximization_objective": objective_value,
        "independently_recomputed_primal_diagnostics": primal,
        "original_scale_signed_margins_binary64": numeric_original,
        "representation_scale_signed_margins_binary64": numeric_rep,
        "original_scale_signed_margins_exact_rational": [frac_record(v) for v in margins_exact] if margins_exact is not None else None,
        "exact_mathematical_witness_status": witness,
        "exact_signal_value": frac_record(signal) if signal is not None else None,
        "numerical_confidence_status": confidence,
        "dual_kkt_status": dual["dual_kkt_status"],
        "independent_optimality_verification": dual["independent_optimality_verification"],
        "available_dual_fields": {
            section: fields.get(section, {}) for section in ("ineqlin", "lower", "upper")
        },
        "dual_kkt_diagnostics": dual,
        "typed_outcome": typed,
        "final_evidence_interpretation": final_interpretation,
        "solver_invocation_attempted": True,
    }
    write_json(output_path, output)


def failed_call_record(cell, elapsed, error, invocation_attempted, data=None, problem=None, options=None):
    if options is None:
        options = registered_solver_options(cell["method"])
    input_hashes = None
    if data is not None:
        fixture = data["fixtures"][cell["fixture_id"]]
        input_hashes = {
            "outer_archive_sha256": data["outer_sha256"],
            "internal_archive_sha256": data["internal_sha256"],
            "model_matrix_sha256": fixture["hashes"]["model_matrix_sha256"],
            "response_sha256": fixture["record"]["response_sha256"],
            "row_order_sha256": fixture["record"]["row_order_sha256"],
            "exact_proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
        }
    record = {
        "schema": "CP-STAT-02-A2-03B-RAW-CELL-v1",
        "cell_id": cell["cell_id"],
        "fixture_id": cell["fixture_id"],
        "representation": cell["representation"],
        "method": cell["method"],
        "problem": cell["problem"],
        "repeat": cell["repeat"],
        "fixture_input_hashes": input_hashes,
        "solver_options": options,
        "objective_coefficients_c": plain(problem["c"]) if problem is not None else None,
        "coefficient_vector_representation_units": None,
        "coefficient_vector_original_units": None,
        "coefficient_vector_binary64_hex": None,
        "A_ub": plain(problem["A_ub"]) if problem is not None else None,
        "b_ub": plain(problem["b_ub"]) if problem is not None else None,
        "variable_bounds": plain(problem["bounds"]) if problem is not None else None,
        "column_max_scales": plain(problem["scales"]) if problem is not None else None,
        "solver_runtime_seconds": elapsed,
        "solver_status": {"status": None, "success": None, "message": error, "nit": None, "crossover_nit": None},
        "scipy_result": "UNMEASURED",
        "required_numeric_fields": {
            "objective_fun_status": "UNMEASURED_MISSING",
            "coefficient_vector_status": "UNMEASURED_MISSING",
            "required_fields_valid_for_solver_outcome": False,
        },
        "independently_recomputed_primal_diagnostics": {"status": "UNMEASURED", "reason": error},
        "original_scale_signed_margins_binary64": None,
        "representation_scale_signed_margins_binary64": None,
        "original_scale_signed_margins_exact_rational": None,
        "exact_mathematical_witness_status": "UNMEASURED",
        "numerical_confidence_status": "UNMEASURED",
        "dual_kkt_status": "UNVERIFIED",
        "independent_optimality_verification": "UNVERIFIED",
        "typed_outcome": "SOLVER_EXECUTION_FAILED",
        "final_evidence_interpretation": "SOLVER_EXECUTION_FAILED; NUMERICAL_FIELDS_UNMEASURED",
        "solver_invocation_attempted": invocation_attempted,
    }
    return record


def run_cell_processes(data, archive_path, metadata_path, evidence_dir, python_path):
    import numpy as np
    cells = load_json(MANIFEST_PATH)["cells"]
    raw_dir = evidence_dir / "raw_results"
    raw_dir.mkdir(parents=True, exist_ok=True)
    records = []
    stop_reason = None
    for index, cell in enumerate(cells, start=1):
        output_path = raw_dir / f"call-{index:02d}.json"
        if stop_reason is not None:
            problem = create_problem(data, cell, np)
            record = failed_call_record(
                cell, 0.0, "UNMEASURED: no invocation; execution stopped after an earlier worker blocker",
                False, data, problem,
            )
            record["typed_outcome"] = "UNMEASURED"
            record["final_evidence_interpretation"] = "UNMEASURED; EXECUTION_STOPPED_AFTER_BLOCKER"
            record["run_stop_reason"] = stop_reason
            record["call_number"] = index
            write_json(output_path, record)
            records.append(record)
            continue
        command = [
            str(python_path), str(pathlib.Path(__file__).resolve()), "worker",
            "--archive", str(archive_path),
            "--metadata", str(metadata_path),
            "--cell-id", cell["cell_id"],
            "--output", str(output_path),
        ]
        try:
            proc = subprocess.run(command, capture_output=True, text=True, timeout=90, check=False)
            if not output_path.is_file():
                marker = output_path.with_suffix(".solver-call-started.json")
                attempted = marker.exists()
                problem = create_problem(data, cell, np)
                record = failed_call_record(cell, 90.0 if proc.returncode == -9 else 0.0,
                    f"worker exited {proc.returncode}; stdout={proc.stdout[-2000:]}; stderr={proc.stderr[-2000:]}", attempted, data, problem)
                record["call_number"] = index
                write_json(output_path, record)
                stop_reason = (
                    f"worker failed before the registered solver invocation in {cell['cell_id']}"
                    if not attempted else
                    f"worker did not preserve a result after the invocation marker in {cell['cell_id']}"
                )
            else:
                record = load_json(output_path)
                record["call_number"] = index
                write_json(output_path, record)
        except subprocess.TimeoutExpired as exc:
            marker = output_path.with_suffix(".solver-call-started.json")
            problem = create_problem(data, cell, np)
            record = failed_call_record(cell, 90.0, "fresh worker exceeded fixed 90-second process guard", marker.exists(), data, problem)
            record["call_number"] = index
            write_json(output_path, record)
            stop_reason = f"fresh worker exceeded its 90-second guard in {cell['cell_id']}"
        if stop_reason is not None:
            record["run_stop_reason"] = stop_reason
            write_json(output_path, record)
        records.append(record)
    return records


def repeatability_report(records):
    groups = {}
    for record in records:
        key = (record.get("fixture_id"), record.get("representation"), record.get("method"), record.get("problem"))
        groups.setdefault(key, []).append(record)
    report = []
    for key, pair in groups.items():
        pair.sort(key=lambda row: row.get("repeat", 0))
        if len(pair) != 2:
            report.append({"cell_group": key, "decision": "UNMEASURED", "reason": "repeat count is not two"})
            continue
        comparison = compare_repeat_records(pair[0], pair[1])
        comparison["cell_group"] = {
            "fixture_id": key[0], "representation": key[1], "method": key[2], "problem": key[3]
        }
        comparison["repeat_cell_ids"] = [pair[0].get("cell_id"), pair[1].get("cell_id")]
        report.append(comparison)
    return {
        "schema": "CP-STAT-02-A2-03B-REPEATABILITY-v1",
        "comparison_count": len(report),
        "metric": "abs(f1-f2) / max(1,abs(f1),abs(f2))",
        "maximum": REPEAT_LIMIT,
        "comparisons": report,
    }


def condition_diagnostics(data):
    import numpy as np
    results = {}
    for fixture_id in FIXTURES:
        fixture = data["fixtures"][fixture_id]
        X = np.asarray([[float(row[col]) for col in EXPECTED_COLUMNS] for row in fixture["matrix_rows"]], dtype=np.float64)
        scales = np.max(np.abs(X), axis=0)
        Xscaled = X / scales
        singular_raw = np.linalg.svd(X, compute_uv=False)
        singular_scaled = np.linalg.svd(Xscaled, compute_uv=False)
        results[fixture_id] = {
            "raw_singular_values": singular_raw.tolist(),
            "column_max_normalized_singular_values": singular_scaled.tolist(),
            "raw_condition_number": float(np.linalg.cond(X)),
            "column_max_normalized_condition_number": float(np.linalg.cond(Xscaled)),
            "numpy_matrix_rank_raw": int(np.linalg.matrix_rank(X)),
            "numpy_matrix_rank_column_max_normalized": int(np.linalg.matrix_rank(Xscaled)),
            "rank_note": "Floating rank/condition diagnostics only; exact ranks in the accepted #6 proof remain authoritative.",
        }
    return results


def accepted_exact_proof_reference(data, fixture_id):
    proofs = data["proof_results"]
    if fixture_id == FIXTURES[0]:
        proof = proofs["fixture_31"]
        return {
            "proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
            "accepted_class": proof["archived_expected_class"],
            "exact_reference_witness_beta": proof["witness_beta_exact"],
            "reference_witness_nonzero": proof["witness_nonzero"],
            "strictly_positive_margins_for_all_rows": proof["strictly_positive_margins_for_all_rows"],
            "reference_minimum_margin": proof["minimum_margin"],
            "reference_minimum_margin_binary64_reconstruction": proof["binary64_reconstructed_minimum_margin"],
            "reference_row_count": proof["sample_size"],
        }
    proof = proofs["fixture_33"]
    return {
        "proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
        "accepted_class": proof["archived_expected_class"],
        "mathematical_implication": proof["mathematical_implication"],
        "common_anchor_group_count": proof["common_anchor_group_count"],
        "common_row_count": proof["common_row_count"],
        "common_anchor_groups": proof["common_anchor_groups"],
        "exact_decimal_rank_X": proof["exact_decimal_rational_ranks"]["rank_X"]["rank"],
        "exact_decimal_rank_common_rows": proof["exact_decimal_rational_ranks"]["rank_common_rows"]["rank"],
        "rank_A_equals_rank_X": proof["rank_A_equals_rank_X"],
    }


def compare_witness_to_accepted_proof(fixture_id, witness_status):
    if witness_status == "UNMEASURED":
        return "UNMEASURED_EXACT_WITNESS_COMPARISON"
    if fixture_id == FIXTURES[0]:
        if witness_status in ("COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED"):
            return "POSITIVE_WITNESS_SUPPORTS_ACCEPTED_COMPLETE_SEPARATION"
        return "NO_POSITIVE_WITNESS_RETURNED; NUMERICAL_RESULT_INCONCLUSIVE_WITH_ACCEPTED_PROOF"
    if witness_status in ("COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED"):
        return "SCIENTIFIC_CLASSIFICATION_DISCREPANCY_POSITIVE_WITNESS_CONTRADICTS_ACCEPTED_NO_WEAK_DIRECTION_PROOF"
    return "NO_POSITIVE_WITNESS_RETURNED; CONSISTENT_WITH_ANCHOR_PROOF_BUT_NOT_A_NUMERICAL_CERTIFICATE"


def scientific_report(data, records, repeats, condition, verdict):
    by_fixture = {}
    for fixture_id in FIXTURES:
        calls = [r for r in records if r.get("fixture_id") == fixture_id]
        exact_class = "COMPLETE_SEPARATION" if fixture_id == FIXTURES[0] else "OVERLAP_NO_WEAK_SEPARATION"
        proof_reference = accepted_exact_proof_reference(data, fixture_id)
        historical = (
            {"1e-4": "QUASI_COMPLETE_SEPARATION", "1e-8": "COMPLETE_SEPARATION"}
            if fixture_id == FIXTURES[0]
            else {"1e-4": "OVERLAP", "1e-8": "QUASI_COMPLETE_SEPARATION_FALSE_POSITIVE"}
        )
        by_fixture[fixture_id] = {
            "accepted_mathematical_fact": exact_class,
            "accepted_proof_commit": "0f27cf3c5a5c0428fdcb3495caebdcaddcae79dd",
            "accepted_exact_proof_reference": proof_reference,
            "comparison_to_accepted_proof_counts": {
                value: sum(1 for r in calls if r.get("comparison_to_accepted_exact_proof") == value)
                for value in sorted({r.get("comparison_to_accepted_exact_proof", "UNMEASURED") for r in calls})
            },
            "a1_historical_observation": historical,
            "highs_call_count": len(calls),
            "solver_status_counts": {
                str(status): sum(1 for r in calls if (r.get("scipy_result", {}).get("status") if isinstance(r.get("scipy_result"), dict) else None) == status)
                for status in [0, 1, 2, 3, 4, None]
            },
            "exact_positive_witness_counts": {
                name: sum(1 for r in calls if r.get("exact_mathematical_witness_status") == name)
                for name in ["COMPLETE_WITNESS_VERIFIED", "WEAK_WITNESS_VERIFIED", "NO_POSITIVE_WITNESS_RETURNED", "UNMEASURED"]
            },
            "typed_outcome_counts": {
                name: sum(1 for r in calls if r.get("typed_outcome") == name)
                for name in ["MATHEMATICAL_CERTIFICATE_SUPPORTED", "NUMERICAL_RESULT_INCONCLUSIVE", "SOLVER_DISAGREEMENT", "SOLVER_EXECUTION_FAILED"]
            },
            "condition_diagnostics": condition[fixture_id],
            "observed_highs_outcomes": [
                {
                    "cell_id": r.get("cell_id"),
                    "representation": r.get("representation"),
                    "method": r.get("method"),
                    "problem": r.get("problem"),
                    "repeat": r.get("repeat"),
                    "solver_status": r.get("scipy_result", {}).get("status") if isinstance(r.get("scipy_result"), dict) else None,
                    "objective": r.get("registered_maximization_objective"),
                    "exact_witness": r.get("exact_mathematical_witness_status"),
                    "comparison_to_accepted_exact_proof": r.get("comparison_to_accepted_exact_proof"),
                    "numeric_confidence": r.get("numerical_confidence_status"),
                    "primal_diagnostics": r.get("independently_recomputed_primal_diagnostics"),
                    "final_interpretation": r.get("final_evidence_interpretation"),
                } for r in calls
            ],
            "root_cause_interpretation": {
                "mathematically_proven": exact_class,
                "independently_observed_highs": "See per-call status/objective/residual/margin records; outcomes are limited to this one frozen environment.",
                "historical_roi_lpsolve": historical,
                "scientifically_supported_causal_explanation": "UNRESOLVED; this experiment does not observe the historical ROI/lpsolve residuals or isolate all package-level behavior.",
                "unresolved_hypotheses": [
                    "numerical conditioning",
                    "column scaling sensitivity",
                    "LP degeneracy",
                    "solver feasibility and optimality behavior",
                    "detectseparation post-solve coefficient/minimum-margin classification thresholds",
                ],
                "evidence_limit": "A1 did not archive all underlying ROI solver residuals; matching/differing HiGHS outputs alone do not identify the cause of historical A1 outcomes.",
            },
        }
    return {
        "schema": "CP-STAT-02-A2-03B-SCIENTIFIC-INTERPRETATION-v1",
        "verdict": verdict,
        "a1_preserved": {"evaluated": 50, "pass": 48, "fail": 2, "unmeasured": 0, "general_detector": "NOT_QUALIFIED"},
        "fixture_findings": by_fixture,
        "solver_independence_note": "highs-ds and highs-ipm are algorithms in the same embedded HiGHS engine; they are not independent solver engines.",
        "negative_separation_certificate": "UNVERIFIED_FOR_ALL_HIGHS_CALLS; accepted exact #6 proofs remain the mathematical reference.",
        "dual_and_kkt": "UNVERIFIED; no independently checked dual-sign/bound-multiplier/KKT formulation was implemented.",
        "repeatability": repeats,
        "falsification_controls": "Reported separately in falsification-report.json; controls make no additional HiGHS calls.",
    }


def markdown_scientific_report(interpretation, controls, manifest, environment, preflight):
    lines = [
        "# A2-03B Frozen HiGHS Numerical Evidence",
        "",
        f"**Verdict:** `{interpretation['verdict']}`",
        "",
        f"**Experiment commit:** `{environment.get('github', {}).get('commit_sha')}`",
        f"**Workflow run:** `{environment.get('github', {}).get('run_id')}`",
        f"**LP calls attempted:** `{preflight.get('linprog_invocation_attempts')}` / 32",
        f"**Falsification controls:** {controls.get('executed_controls')} executed; all passed = `{controls.get('all_controls_passed')}`",
        "",
        "## Fixture 31",
        "",
        "The accepted exact-rational proof establishes complete separation. This experiment reports only the observed HiGHS statuses, objectives, independently recomputed residuals and exact witness checks in the per-call records. Any exact positive witness remains mathematical evidence even if its signal is at/below the fixed 1e-8 reporting floor; the confidence field is separate.",
        "",
        "## Fixture 33",
        "",
        "The accepted opposite-anchor/full-rank proof establishes no nonzero weak separating direction and a finite unique logistic MLE for this design. HiGHS calls without a positive witness do not establish nonseparation. No HiGHS negative separation certificate or verified LP optimality is claimed because dual/KKT evidence is UNVERIFIED.",
        "",
        "## Root-cause limits",
        "",
        "Historical A1 outcomes are preserved exactly. No causal root cause is assigned from cross-solver agreement or disagreement. The A1 artifact does not include all underlying ROI/lpsolve residuals. Conditioning, scaling, degeneracy, solver tolerances, and package-level minimum-margin thresholds remain separately reported hypotheses unless directly supported by observed evidence.",
        "",
        "The full 32-cell ledger, raw solver fields, original/scaled signed margins, exact rational checks, independent primal residuals, repeatability metrics, environment/source hashes, and explicit missing/failed records are included alongside this report.",
    ]
    for fixture_id, title in ((FIXTURES[0], "Fixture 31"), (FIXTURES[1], "Fixture 33")):
        finding = interpretation["fixture_findings"][fixture_id]
        reference = finding["accepted_exact_proof_reference"]
        lines.extend([
            "",
            f"### Observed evidence — {title}",
            "",
            f"- HiGHS cells: {finding['highs_call_count']}; SciPy status counts: `{json.dumps(finding['solver_status_counts'], sort_keys=True)}`.",
            f"- Exact witness counts: `{json.dumps(finding['exact_positive_witness_counts'], sort_keys=True)}`.",
            f"- Comparisons with accepted exact proof: `{json.dumps(finding['comparison_to_accepted_proof_counts'], sort_keys=True)}`.",
            f"- Typed outcomes: `{json.dumps(finding['typed_outcome_counts'], sort_keys=True)}`.",
        ])
        if fixture_id == FIXTURES[0]:
            exact_min = reference["reference_minimum_margin"]["exact"]
            beta = [f"{value['numerator']}/{value['denominator']}" for value in reference["exact_reference_witness_beta"]]
            lines.extend([
                f"- Frozen comparison witness: beta `{beta}`; its exact minimum signed margin is `{exact_min['numerator']}/{exact_min['denominator']}` (approximately `{exact_min['decimal_approximation']}`), strictly positive on all {reference['reference_row_count']} rows.",
                "- Each returned coefficient vector is checked as an exact rational against the same archived full-precision matrix; a missing returned witness remains numerically inconclusive.",
            ])
        else:
            anchors = [
                f"{group['control_row_ids']} / {group['treated_row_ids']}"
                for group in reference["common_anchor_groups"]
            ]
            lines.extend([
                f"- Frozen comparison proof: {reference['common_anchor_group_count']} opposite-treatment common-anchor groups `{anchors}` span rank {reference['exact_decimal_rank_common_rows']} of the rank-{reference['exact_decimal_rank_X']} design.",
                "- A returned exact positive weak witness would be reported as a scientific discrepancy with that proof. No returned witness is consistent with the proof but does not make a numerical negative certificate.",
            ])
    return "\n".join(lines) + "\n"


def checksums_for_directory(directory: pathlib.Path):
    entries = []
    for path in sorted(p for p in directory.rglob("*") if p.is_file() and p.name != "SHA256SUMS"):
        relative = path.relative_to(directory).as_posix()
        entries.append(f"{sha256_file(path)}  {relative}")
    (directory / "SHA256SUMS").write_text("\n".join(entries) + "\n", encoding="utf-8")
    return entries


def run_experiment(args):
    evidence_dir = pathlib.Path(args.evidence_dir).resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)
    artifact_dir = pathlib.Path(args.download_dir).resolve()
    archive_path = artifact_dir / "original-a1-artifact.zip"
    metadata_path = artifact_dir / "original-a1-artifact-metadata.json"
    status_path = evidence_dir / "execution-status.json"
    base_status = {
        "schema": "CP-STAT-02-A2-03B-EXECUTION-STATUS-v1",
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "commit_sha": os.environ.get("GITHUB_SHA"),
        "linprog_invocation_attempts": 0,
        "completed_manifest_cells": 0,
        "verdict": None,
    }
    try:
        frozen = verify_frozen_files()
        manifest_check = verify_manifest()
        pip_report = pathlib.Path(args.pip_report).resolve()
        environment = collect_environment(pip_report)
        shutil.copy2(pip_report, evidence_dir / "pip-install-report.json")
        environment["locked_wheels"] = parse_install_report(pip_report)
        write_json(evidence_dir / "environment-manifest.json", environment)
        metadata, raw_archive = download_original_artifact(
            os.environ.get("GITHUB_TOKEN", ""),
            os.environ.get("GITHUB_REPOSITORY", ""),
            archive_path,
        )
        write_json(metadata_path, metadata)
        data = verify_archive_bytes(raw_archive, metadata)
        # Static checks and all controls are complete before any child can call linprog.
        static = static_checks(data)
        source_hash = sha256_bytes(raw_archive)
        proof_hash = sha256_file(PROOF_DIR / "proof-evidence-manifest.json")
        controls = run_falsification_controls(data, source_hash, proof_hash)
        write_json(evidence_dir / "preflight.json", {
            "status": "PASS",
            "frozen_inputs": frozen,
            "execution_manifest": manifest_check,
            "archive_verification": {k: v for k, v in data.items() if k not in ("files", "proof_results", "a1_results", "fixtures", "proof_module")},
            "static_checks": static,
            "falsification_controls_passed_before_first_lp": controls["all_controls_passed"],
            "solver_calls_before_preflight_completion": 0,
        })
        write_json(evidence_dir / "falsification-report.json", controls)
        if not controls["all_controls_passed"]:
            raise PreflightError("one or more frozen falsification controls failed")
        conditions = condition_diagnostics(data)
        write_json(evidence_dir / "condition-diagnostics.json", conditions)
        python_path = pathlib.Path(environment["packages"]["python"]["executable_realpath"])
        records = run_cell_processes(data, archive_path, metadata_path, evidence_dir, python_path)
        for number, record in enumerate(records, start=1):
            record["call_number"] = number
            # The accepted reference is joined only after this cell's solver call or
            # explicit no-invocation record; no expected class is passed to HiGHS.
            record["accepted_exact_proof_reference"] = accepted_exact_proof_reference(
                data, record["fixture_id"]
            )
            record["comparison_to_accepted_exact_proof"] = compare_witness_to_accepted_proof(
                record["fixture_id"], record.get("exact_mathematical_witness_status", "UNMEASURED")
            )
            write_json(evidence_dir / "raw_results" / f"call-{number:02d}.json", record)
        repeats = repeatability_report(records)
        write_json(evidence_dir / "repeatability-report.json", repeats)
        # A complete ledger with no forced class is ready for independent review.
        complete = len(records) == 32 and all(r.get("cell_id") for r in records)
        worker_stop = next((r.get("run_stop_reason") for r in records if r.get("run_stop_reason")), None)
        invocation_attempts = sum(1 for r in records if r.get("solver_invocation_attempted"))
        all_solver_success = complete and all(
            isinstance(r.get("scipy_result"), dict)
            and r["scipy_result"].get("status") == 0
            and r["scipy_result"].get("success") is True
            and r.get("required_numeric_fields", {}).get("required_fields_valid_for_solver_outcome") is True
            for r in records
        )
        no_disagreement = all(row.get("decision") == "REPEATABILITY_WITHIN_REGISTERED_LIMIT" for row in repeats["comparisons"])
        no_proof_discrepancy = all(
            not str(r.get("comparison_to_accepted_exact_proof", "")).startswith("SCIENTIFIC_CLASSIFICATION_DISCREPANCY")
            for r in records
        )
        if worker_stop and invocation_attempts == 0:
            verdict = "A2_03B_EXECUTION_BLOCKED"
        elif complete and all_solver_success and no_disagreement and no_proof_discrepancy and worker_stop is None:
            verdict = "A2_03B_NUMERICAL_EVIDENCE_READY_FOR_RED_TEAM"
        else:
            verdict = "A2_03B_NUMERICAL_EVIDENCE_INCONCLUSIVE"
        interpretation = scientific_report(data, records, repeats, conditions, verdict)
        write_json(evidence_dir / "scientific-interpretation.json", interpretation)
        (evidence_dir / "A2_03B_NUMERICAL_EVIDENCE_REPORT.md").write_text(
            markdown_scientific_report(interpretation, controls, manifest_check, environment, {
                "linprog_invocation_attempts": sum(1 for r in records if r.get("solver_invocation_attempted")),
            }),
            encoding="utf-8",
        )
        source_summary = {
            "schema": "CP-STAT-02-A2-03B-SOURCE-IDENTITIES-v1",
            "frozen_inputs_lock_sha256": frozen["lock_sha256"],
            "frozen_files_sha256": frozen["checked_files"],
            "source_artifact": data["github_source"],
            "internal_archive_sha256": data["internal_sha256"],
            "proof_manifest_sha256": EXPECTED_PROOF_MANIFEST,
            "matrix_sha256": MATRIX_HASHES,
            "wheel_sha256": environment["locked_wheels"],
            "experiment_commit_sha": os.environ.get("GITHUB_SHA"),
        }
        write_json(evidence_dir / "source-and-package-hashes.json", source_summary)
        base_status.update({
            "linprog_invocation_attempts": invocation_attempts,
            "completed_manifest_cells": len(records),
            "verdict": verdict,
            "preflight_status": "PASS",
        })
        if worker_stop:
            base_status["execution_blocker"] = worker_stop
        write_json(status_path, base_status)
    except Exception as exc:
        # This path records a blocker and stops before any solver if preflight failed.
        # If failure occurred after some calls, prior raw results remain and are not rerun.
        preflight_file = evidence_dir / "preflight.json"
        previous_attempts = 0
        raw_dir = evidence_dir / "raw_results"
        if raw_dir.exists():
            for result_path in raw_dir.glob("call-*.json"):
                try:
                    if load_json(result_path).get("solver_invocation_attempted"):
                        previous_attempts += 1
                except Exception:
                    pass
        base_status["linprog_invocation_attempts"] = previous_attempts
        base_status["completed_manifest_cells"] = len(list(raw_dir.glob("call-*.json"))) if raw_dir.exists() else 0
        if previous_attempts:
            failure_verdict = "A2_03B_NUMERICAL_EVIDENCE_INCONCLUSIVE"
        else:
            failure_verdict = "A2_03B_EXECUTION_BLOCKED"
        base_status.update({
            "verdict": failure_verdict,
            "blocker": {"type": type(exc).__name__, "message": str(exc), "traceback": traceback.format_exc()},
        })
        write_json(evidence_dir / "A2_03B_BLOCKER.json", base_status["blocker"])
        write_json(status_path, base_status)
        if not (evidence_dir / "falsification-report.json").exists():
            write_json(evidence_dir / "falsification-report.json", {
                "schema": "CP-STAT-02-A2-03B-FALSIFICATION-REPORT-v1",
                "registered_controls": 15,
                "executed_controls": 0,
                "controls": [],
                "all_controls_passed": False,
                "unmeasured_reason": "preflight blocked before controls could run",
            })
    # Always retain runner identity and hashes in the evidence output if present.
    if FREEZE_PATH.exists():
        base_status["frozen_inputs_lock_sha256"] = sha256_file(FREEZE_PATH)
    write_json(status_path, base_status)
    # The workflow only reaches upload after this directory is checksummed.
    checksums_for_directory(evidence_dir)
    if base_status.get("verdict") != "A2_03B_NUMERICAL_EVIDENCE_READY_FOR_RED_TEAM":
        return 1
    return 0


def record_external_blocker(args):
    evidence_dir = pathlib.Path(args.evidence_dir).resolve()
    evidence_dir.mkdir(parents=True, exist_ok=True)
    status = {
        "schema": "CP-STAT-02-A2-03B-EXECUTION-STATUS-v1",
        "workflow_run_id": os.environ.get("GITHUB_RUN_ID"),
        "commit_sha": os.environ.get("GITHUB_SHA"),
        "linprog_invocation_attempts": 0,
        "completed_manifest_cells": 0,
        "verdict": "A2_03B_EXECUTION_BLOCKED",
        "blocker": args.message,
        "setup_python_outcome": os.environ.get("SETUP_PYTHON_OUTCOME"),
        "locked_wheel_install_outcome": os.environ.get("WHEEL_INSTALL_OUTCOME"),
    }
    write_json(evidence_dir / "execution-status.json", status)
    write_json(evidence_dir / "A2_03B_BLOCKER.json", status)
    write_json(evidence_dir / "falsification-report.json", {
        "schema": "CP-STAT-02-A2-03B-FALSIFICATION-REPORT-v1",
        "registered_controls": 15,
        "executed_controls": 0,
        "controls": [],
        "all_controls_passed": False,
        "unmeasured_reason": "pinned runtime or wheel setup failed before preflight",
    })
    checksums_for_directory(evidence_dir)
    return 1


def self_test(archive_path: pathlib.Path, require_frozen: bool):
    raw = archive_path.read_bytes()
    data = verify_archive_bytes(raw)
    static = static_checks(data, require_frozen=require_frozen)
    archive_hash = sha256_bytes(raw)
    proof_hash = sha256_file(PROOF_DIR / "proof-evidence-manifest.json")
    controls = run_falsification_controls(data, archive_hash, proof_hash)
    if not controls["all_controls_passed"]:
        failed = [row["control_id"] for row in controls["controls"] if row["status"] != "PASS"]
        raise PreflightError("falsification controls failed: " + ",".join(failed))
    print(json.dumps({
        "status": "PASS",
        "static_checks": static,
        "outer_archive_sha256": data["outer_sha256"],
        "internal_archive_sha256": data["internal_sha256"],
        "member_checksums_verified": data["sha256sums_verified_entries"],
        "matrix_sha256": data["matrix_sha256"],
        "falsification_controls": controls,
        "solver_calls": 0,
    }, indent=2, sort_keys=True, allow_nan=False))
    return 0


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    test = sub.add_parser("self-test")
    test.add_argument("--archive", required=True)
    test.add_argument("--require-frozen", action="store_true")
    run = sub.add_parser("run")
    run.add_argument("--evidence-dir", required=True)
    run.add_argument("--download-dir", required=True)
    run.add_argument("--pip-report", required=True)
    blocker = sub.add_parser("record-blocker")
    blocker.add_argument("--evidence-dir", required=True)
    blocker.add_argument("--message", required=True)
    worker = sub.add_parser("worker")
    worker.add_argument("--archive", required=True)
    worker.add_argument("--metadata", required=True)
    worker.add_argument("--cell-id", required=True)
    worker.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        if args.command == "self-test":
            return self_test(pathlib.Path(args.archive), args.require_frozen)
        if args.command == "run":
            return run_experiment(args)
        if args.command == "record-blocker":
            return record_external_blocker(args)
        if args.command == "worker":
            worker_cell(pathlib.Path(args.archive), pathlib.Path(args.metadata), args.cell_id, pathlib.Path(args.output))
            return 0
    except Exception as exc:
        print(f"A2-03B {args.command} failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 2
    return 2


if __name__ == "__main__":
    sys.exit(main())
