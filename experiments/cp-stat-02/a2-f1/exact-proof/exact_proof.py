#!/usr/bin/env python3
"""Verify frozen A1 evidence and prove fixtures 31/33 with exact rationals.

Only Python's standard library is used.  Archived decimal tokens are parsed
directly as Fraction objects.  The separate binary64 reconstruction below is
also integer/rational arithmetic; it never constructs a float.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import tarfile
import zipfile
from decimal import Decimal, localcontext
from fractions import Fraction
from pathlib import Path, PurePosixPath
from typing import Any


ZIP_SHA256 = "ebf2d899a4d1bb8404415183dd35d4d7eb221b5a33b0eec1f8d7e9eb4e5c5c6a"
INTERNAL_TAR_SHA256 = "326b94c50d9cbbdf72967c0df0d495761e7b736afb30906e60030c3d1d8ae554"
ARTIFACT_ID = "12560933385"
WORKFLOW_ID = "40097510667"
A1_COMMIT = "579a2532a5fe210917e2b37e7d7f950c8d01d78f"
A1_PHASE_BASELINE = "c3bda2ed841486aadcb5c44f0caa883662a17cf2"
FIXTURE_31 = "cpstat02a1_31_small_scale_complete"
FIXTURE_33 = "cpstat02a1_33_heterogeneous_scale_overlap"
EXPECTED_COLUMNS = ["(Intercept)", "x1", "x2"]


class EvidenceError(ValueError):
    """Raised when archived identity or structure does not verify."""


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fraction(token: str) -> Fraction:
    """Parse an archived decimal token without an intermediate float."""
    try:
        return Fraction(token)
    except (ValueError, ZeroDivisionError) as exc:
        raise EvidenceError(f"invalid exact decimal token: {token!r}") from exc


def round_quotient_ties_even(value: Fraction) -> int:
    q, r = divmod(value.numerator, value.denominator)
    doubled = 2 * r
    if doubled > value.denominator or (doubled == value.denominator and q % 2):
        q += 1
    return q


def nearest_binary64_fraction(value: Fraction) -> Fraction:
    """Return the exact rational for round-to-nearest-even IEEE binary64.

    This works only with integer/rational operations.  All archived matrix
    values are normal binary64 magnitudes, but subnormal handling is included.
    """
    if value == 0:
        return Fraction(0)
    sign = -1 if value < 0 else 1
    x = abs(value)
    exponent = x.numerator.bit_length() - x.denominator.bit_length()
    if exponent >= 0:
        if x < Fraction(1 << exponent):
            exponent -= 1
    elif x * (1 << (-exponent)) < 1:
        exponent -= 1

    if exponent < -1022:
        significand = round_quotient_ties_even(x * (1 << 1074))
        rounded = Fraction(significand, 1 << 1074)
        return sign * rounded
    if exponent > 1023:
        raise EvidenceError("decimal token is outside finite binary64 range")

    shift = exponent - 52
    scaled = x / (1 << shift) if shift >= 0 else x * (1 << (-shift))
    significand = round_quotient_ties_even(scaled)
    if significand == (1 << 53):
        exponent += 1
        significand = 1 << 52
    if exponent > 1023:
        raise EvidenceError("rounded decimal token overflows binary64")
    rounded = Fraction(significand * (1 << max(0, exponent - 52)), 1)
    if exponent - 52 < 0:
        rounded = Fraction(significand, 1 << (52 - exponent))
    return sign * rounded


def exact_value(value: Fraction) -> dict[str, str]:
    with localcontext() as ctx:
        ctx.prec = 45
        readable = format(Decimal(value.numerator) / Decimal(value.denominator), ".35E")
    return {
        "numerator": str(value.numerator),
        "denominator": str(value.denominator),
        "decimal_approximation": readable,
    }


def normalized_member(name: str) -> str:
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        raise EvidenceError(f"unsafe archive path: {name!r}")
    parts = [part for part in path.parts if part not in (".", "")]
    return "/".join(parts)


def load_verified_archive(zip_path: Path) -> tuple[dict[str, bytes], dict[str, Any]]:
    zip_bytes = zip_path.read_bytes()
    zip_digest = sha256(zip_bytes)
    if zip_digest != ZIP_SHA256:
        raise EvidenceError(f"outer artifact SHA-256 mismatch: {zip_digest}")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        names = set(archive.namelist())
        tar_name = ".cp-stat-02-a1-evidence.tar.gz"
        sidecar_name = tar_name + ".sha256"
        if names != {tar_name, sidecar_name}:
            raise EvidenceError(f"unexpected outer ZIP members: {sorted(names)}")
        tar_bytes = archive.read(tar_name)
        sidecar = archive.read(sidecar_name).decode("utf-8").strip()
    tar_digest = sha256(tar_bytes)
    sidecar_digest = sidecar.split()[0] if sidecar else ""
    if tar_digest != INTERNAL_TAR_SHA256 or sidecar_digest != INTERNAL_TAR_SHA256:
        raise EvidenceError("internal evidence archive SHA-256 mismatch")

    files: dict[str, bytes] = {}
    with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as archive:
        for member in archive.getmembers():
            if member.isdir():
                continue
            if not member.isfile():
                raise EvidenceError(f"unexpected non-regular tar entry: {member.name}")
            key = normalized_member(member.name)
            if key in files:
                raise EvidenceError(f"duplicate tar member: {key}")
            stream = archive.extractfile(member)
            if stream is None:
                raise EvidenceError(f"cannot read tar member: {member.name}")
            files[key] = stream.read()

    if "SHA256SUMS" not in files:
        raise EvidenceError("archived SHA256SUMS is missing")
    checksums: dict[str, str] = {}
    for line_number, line in enumerate(files["SHA256SUMS"].decode("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        fields = line.split(maxsplit=1)
        if len(fields) != 2 or not re.fullmatch(r"[0-9a-f]{64}", fields[0]):
            raise EvidenceError(f"malformed SHA256SUMS line {line_number}")
        checksums[normalized_member(fields[1])] = fields[0]
    if len(checksums) != 160:
        raise EvidenceError(f"expected 160 SHA256SUMS entries, found {len(checksums)}")
    for name, expected in checksums.items():
        if name not in files:
            raise EvidenceError(f"SHA256SUMS member missing from archive: {name}")
        actual = sha256(files[name])
        if actual != expected:
            raise EvidenceError(f"SHA256SUMS mismatch for {name}: {actual}")

    manifest = {
        "outer_zip_sha256": zip_digest,
        "outer_zip_bytes": len(zip_bytes),
        "internal_archive_sha256": tar_digest,
        "internal_archive_bytes": len(tar_bytes),
        "sha256sums_entries_verified": len(checksums),
        "sha256sums_file_sha256": sha256(files["SHA256SUMS"]),
        "unlisted_regular_files": sorted(set(files) - set(checksums) - {"SHA256SUMS"}),
        "unlisted_file_sha256": {
            name: sha256(files[name])
            for name in sorted(set(files) - set(checksums) - {"SHA256SUMS"})
        },
        "archive_files": files,
    }
    return files, manifest


def parse_json_bytes(raw: bytes, name: str) -> Any:
    try:
        return json.loads(raw.decode("utf-8"), parse_float=str)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise EvidenceError(f"invalid archived JSON {name}: {exc}") from exc


def csv_rows(raw: bytes, name: str) -> tuple[list[str], list[dict[str, str]]]:
    try:
        text = raw.decode("utf-8")
        reader = csv.DictReader(io.StringIO(text, newline=""))
        headers = reader.fieldnames or []
        if len(headers) != len(set(headers)):
            raise EvidenceError(f"duplicate CSV column in {name}")
        rows = list(reader)
        if any(None in row for row in rows):
            raise EvidenceError(f"ragged CSV row in {name}")
        return headers, rows
    except UnicodeDecodeError as exc:
        raise EvidenceError(f"invalid UTF-8 CSV {name}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        raise EvidenceError(message)


def verify_recorded_matrix(record: dict[str, Any], headers: list[str], rows: list[dict[str, str]]) -> None:
    columns = record["model_matrix_columns"]
    require(columns == EXPECTED_COLUMNS, f"model matrix column identity mismatch: {record['fixture_id']}")
    require(headers == ["row_id"] + columns, f"model CSV column identity mismatch: {record['fixture_id']}")
    ids = [row["row_id"] for row in rows]
    require(len(rows) == record["sample_size"] == len(record["model_matrix_values"]),
            f"model matrix row count mismatch: {record['fixture_id']}")
    require(ids == record["row_ids"], f"model matrix row identity/order mismatch: {record['fixture_id']}")
    for i, row in enumerate(rows):
        require(list(record["model_matrix_values"][i].keys()) == columns,
                f"JSON matrix columns/order mismatch at {ids[i]}")
        for column in columns:
            require(row[column] == record["model_matrix_values"][i][column],
                    f"CSV/JSON model-matrix token mismatch at {ids[i]}.{column}")


def verify_recorded_response(record: dict[str, Any], row_ids: list[str], response: list[int]) -> None:
    require(row_ids == record["row_ids"], f"response row identity/order mismatch: {record['fixture_id']}")
    require(response == record["response_values"], f"response values mismatch: {record['fixture_id']}")
    response_tokens = [str(value) for value in response]
    require(sha256("\n".join(response_tokens).encode()) == record["response_sha256"],
            f"response digest mismatch: {record['fixture_id']}")


def verify_fixture_inputs(files: dict[str, bytes], results: dict[str, Any], fixture_id: str) -> dict[str, Any]:
    records = [row for row in results["fixtures"] if row.get("fixture_id") == fixture_id]
    require(len(records) == 1, f"expected one result record for {fixture_id}")
    record = records[0]
    spec_path = f"specs/{fixture_id}.json"
    input_path = f"fixtures/{fixture_id}.csv"
    matrix_path = f"model-matrices/{fixture_id}.csv"
    require(spec_path in files and input_path in files and matrix_path in files, f"missing archived file for {fixture_id}")

    spec_raw, input_raw, matrix_raw = files[spec_path], files[input_path], files[matrix_path]
    spec = parse_json_bytes(spec_raw, spec_path)
    require(sha256(spec_raw) == record["spec_sha256"], f"spec hash mismatch: {fixture_id}")
    require(record["spec_path"] == spec_path, f"spec path mismatch: {fixture_id}")
    require(sha256(input_raw) == record["input_csv_sha256"], f"input CSV hash mismatch: {fixture_id}")
    require(record["input_csv_path"] == input_path, f"input path mismatch: {fixture_id}")
    require(sha256(matrix_raw) == record["model_matrix_sha256"], f"model matrix hash mismatch: {fixture_id}")

    input_headers, input_rows = csv_rows(input_raw, input_path)
    matrix_headers, matrix_rows = csv_rows(matrix_raw, matrix_path)
    require(input_headers == ["row_id", "treat", "x1", "x2"], f"unexpected input columns: {fixture_id}")
    verify_recorded_matrix(record, matrix_headers, matrix_rows)
    columns = record["model_matrix_columns"]
    require(spec["fixture_id"] == fixture_id, f"spec identity mismatch: {fixture_id}")
    require(record["formula"] == "treat ~ x1 + x2", f"formula mismatch: {fixture_id}")
    require(record["factor_levels"] == [] and record["factor_reference"] == "A" and record["factor_contrasts"] is None,
            f"factor/reference/contrast metadata mismatch: {fixture_id}")
    require(record["expected_separation"] == spec["expected_separation"], f"expected-class mismatch: {fixture_id}")
    require(record["sample_size"] == len(input_rows) == len(matrix_rows), f"sample size mismatch: {fixture_id}")
    input_ids = [row["row_id"] for row in input_rows]
    matrix_ids = [row["row_id"] for row in matrix_rows]
    require(len(set(input_ids)) == len(input_ids), f"duplicate input row ID: {fixture_id}")
    require(input_ids == matrix_ids == record["row_ids"], f"row identity/order mismatch: {fixture_id}")
    response_strings = [row["treat"] for row in input_rows]
    require(all(x in ("0", "1") for x in response_strings), f"non-binary treatment token: {fixture_id}")
    response = [int(x) for x in response_strings]
    require(response == record["response_values"], f"treatment response mismatch: {fixture_id}")
    require(sha256("\n".join(input_ids).encode()) == record["row_order_sha256"], f"row-order digest mismatch: {fixture_id}")
    require(sha256("\n".join(response_strings).encode()) == record["response_sha256"], f"response digest mismatch: {fixture_id}")

    json_matrix = record["model_matrix_values"]
    require(len(json_matrix) == len(matrix_rows), f"JSON matrix row count mismatch: {fixture_id}")

    # The archived input CSV and model matrix were written through separate R
    # serializers.  Preserve and count predictor-token differences; the matrix
    # proof uses the archived full-precision matrix, never a reconstructed or
    # regenerated matrix.  Treatment and row identity are checked above.
    predictor_serialization_differences: dict[str, int] = {}
    for i, (source_row, matrix_row) in enumerate(zip(input_rows, matrix_rows)):
        for column in ("x1", "x2"):
            source_binary = nearest_binary64_fraction(fraction(source_row[column]))
            matrix_binary = nearest_binary64_fraction(fraction(matrix_row[column]))
            if source_binary != matrix_binary:
                predictor_serialization_differences[column] = predictor_serialization_differences.get(column, 0) + 1
        require(fraction(matrix_row["(Intercept)"]) == 1, f"intercept token mismatch at {input_ids[i]}")

    return {
        "fixture_id": fixture_id,
        "record": record,
        "spec": spec,
        "input_rows": input_rows,
        "matrix_rows": matrix_rows,
        "row_ids": input_ids,
        "response": response,
        "columns": columns,
        "input_vs_matrix_predictor_binary64_differences": predictor_serialization_differences,
        "hashes": {
            "spec_sha256": sha256(spec_raw),
            "input_csv_sha256": sha256(input_raw),
            "model_matrix_sha256": sha256(matrix_raw),
        },
    }


def exact_rank(rows: list[list[Fraction]], column_count: int | None = None) -> dict[str, Any]:
    if not rows:
        return {"rank": 0, "pivot_columns": [], "pivot_values": []}
    width = column_count if column_count is not None else len(rows[0])
    a = [row[:] for row in rows]
    pivot_row = 0
    pivot_columns: list[int] = []
    pivot_values: list[Fraction] = []
    for column in range(width):
        selected = next((i for i in range(pivot_row, len(a)) if a[i][column] != 0), None)
        if selected is None:
            continue
        a[pivot_row], a[selected] = a[selected], a[pivot_row]
        pivot = a[pivot_row][column]
        pivot_values.append(pivot)
        a[pivot_row] = [value / pivot for value in a[pivot_row]]
        for i in range(len(a)):
            if i == pivot_row or a[i][column] == 0:
                continue
            factor_value = a[i][column]
            a[i] = [left - factor_value * right for left, right in zip(a[i], a[pivot_row])]
        pivot_columns.append(column)
        pivot_row += 1
        if pivot_row == len(a):
            break
    return {
        "rank": len(pivot_columns),
        "pivot_columns": pivot_columns,
        "pivot_values": [exact_value(x) for x in pivot_values],
    }


def determinant3(rows: list[list[Fraction]]) -> Fraction:
    if len(rows) != 3 or any(len(row) != 3 for row in rows):
        raise ValueError("determinant3 requires exactly three 3-column rows")
    a, b, c = rows[0]
    d, e, f = rows[1]
    g, h, i = rows[2]
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def matrix_fractions(data: dict[str, Any], binary64: bool = False) -> list[list[Fraction]]:
    result = []
    for row in data["matrix_rows"]:
        values = [fraction(row[column]) for column in data["columns"]]
        if binary64:
            values = [nearest_binary64_fraction(value) for value in values]
        result.append(values)
    return result


def strict_witness(x: list[list[Fraction]], y: list[int], beta: list[Fraction]) -> list[Fraction]:
    if len(beta) != len(x[0]) or not any(beta):
        return []
    return [((1 if response == 1 else -1) * sum((a * b for a, b in zip(row, beta)), Fraction(0)))
            for row, response in zip(x, y)]


def prove_fixture31(data: dict[str, Any]) -> dict[str, Any]:
    x_decimal = matrix_fractions(data)
    x_binary = matrix_fractions(data, binary64=True)
    y = data["response"]
    beta = [Fraction(0), Fraction(1), Fraction(0)]
    margins_decimal = strict_witness(x_decimal, y, beta)
    margins_binary = strict_witness(x_binary, y, beta)
    if not margins_decimal or min(margins_decimal) <= 0 or min(margins_binary) <= 0:
        classification = "MATHEMATICAL_GROUND_TRUTH_DISPUTED"
    else:
        classification = "MATHEMATICAL_GROUND_TRUTH_CONFIRMED"
    min_d = min(margins_decimal)
    max_d = max(margins_decimal)
    min_b = min(margins_binary)
    max_b = max(margins_binary)
    min_index = margins_decimal.index(min_d)
    max_index = margins_decimal.index(max_d)
    treated_x1 = [x_decimal[i][1] for i, response in enumerate(y) if response == 1]
    control_x1 = [x_decimal[i][1] for i, response in enumerate(y) if response == 0]
    rank_decimal = exact_rank(x_decimal, len(data["columns"]))
    rank_binary = exact_rank(x_binary, len(data["columns"]))
    scale = Fraction("1e-6")
    return {
        "fixture_id": FIXTURE_31,
        "classification": classification,
        "archived_expected_class": data["record"]["expected_separation"],
        "historical_A1_classifications": {"1e-4": "QUASI_COMPLETE_SEPARATION", "1e-8": "COMPLETE_SEPARATION"},
        "columns": data["columns"],
        "sample_size": len(y),
        "treatment_counts": {"control": y.count(0), "treated": y.count(1)},
        "witness_beta_exact": [exact_value(x) for x in beta],
        "witness_nonzero": any(beta),
        "strictly_positive_margins_for_all_rows": bool(margins_decimal) and all(x > 0 for x in margins_decimal),
        "decimal_rational_margins": [
            {"row_id": data["row_ids"][i], "margin": exact_value(margins_decimal[i])}
            for i in range(len(y))
        ],
        "minimum_margin": {"row_id": data["row_ids"][min_index], "exact": exact_value(min_d)},
        "maximum_margin": {"row_id": data["row_ids"][max_index], "exact": exact_value(max_d)},
        "binary64_reconstructed_minimum_margin": exact_value(min_b),
        "binary64_reconstructed_maximum_margin": exact_value(max_b),
        "independent_interval_check": {
            "minimum_treated_x1": exact_value(min(treated_x1)),
            "maximum_control_x1": exact_value(max(control_x1)),
            "all_treated_x1_positive": min(treated_x1) > 0,
            "all_control_x1_negative": max(control_x1) < 0,
        },
        "model_matrix_exact_rank": rank_decimal,
        "model_matrix_binary64_exact_rank": rank_binary,
        "invertible_scale": {
            "factor": exact_value(scale),
            "nonzero": scale != 0,
            "scaled_direction": ["0", "1", "0"],
            "corresponding_unscaled_direction": ["0", "1e-6", "0"],
            "explanation": "X_scaled = X_unscaled * diag(1, 1e-6, 1); coefficient map beta_unscaled = diag(1, 1e-6, 1) beta_scaled is invertible.",
        },
        "proof_scope": "Exact archived decimal-rational model matrix and exact reconstructed IEEE-754 binary64 values; no numerical optimizer used.",
    }


def anchor_groups(matrix_rows: list[dict[str, str]], columns: list[str], row_ids: list[str], y: list[int], binary64: bool = False) -> list[dict[str, Any]]:
    groups: dict[tuple[Fraction, ...], dict[int, list[int]]] = {}
    raw_values: dict[tuple[Fraction, ...], list[str]] = {}
    for index, row in enumerate(matrix_rows):
        raw = [fraction(row[column]) for column in columns]
        values = [nearest_binary64_fraction(x) for x in raw] if binary64 else raw
        key = tuple(values)
        groups.setdefault(key, {0: [], 1: []})[y[index]].append(index)
        raw_values.setdefault(key, [row[column] for column in columns])
    result = []
    for key, by_class in groups.items():
        if by_class[0] and by_class[1]:
            result.append({
                "vector": list(key),
                "decimal_values": raw_values[key],
                "control_indices": by_class[0],
                "treated_indices": by_class[1],
                "control_row_ids": [row_ids[i] for i in by_class[0]],
                "treated_row_ids": [row_ids[i] for i in by_class[1]],
            })
    return result


def select_independent_rows(rows: list[list[Fraction]], row_ids: list[str]) -> list[int]:
    selected: list[int] = []
    current_rank = 0
    for index, row in enumerate(rows):
        next_rank = exact_rank([rows[i] for i in selected] + [row], len(row)).get("rank", 0)
        if next_rank > current_rank:
            selected.append(index)
            current_rank = next_rank
        if current_rank == len(row):
            break
    if current_rank != len(rows[0]) if rows else current_rank != 0:
        raise EvidenceError("anchor rows do not span all model-matrix columns")
    return selected


def prove_fixture33(data: dict[str, Any]) -> dict[str, Any]:
    y = data["response"]
    x_decimal = matrix_fractions(data)
    x_binary = matrix_fractions(data, binary64=True)
    anchors_decimal = anchor_groups(data["matrix_rows"], data["columns"], data["row_ids"], y)
    anchors_binary = anchor_groups(data["matrix_rows"], data["columns"], data["row_ids"], y, binary64=True)
    decimal_signatures = {
        (tuple(row["control_row_ids"]), tuple(row["treated_row_ids"]))
        for row in anchors_decimal
    }
    binary_signatures = {
        (tuple(row["control_row_ids"]), tuple(row["treated_row_ids"]))
        for row in anchors_binary
    }
    if decimal_signatures != binary_signatures:
        classification = "MATHEMATICAL_GROUND_TRUTH_UNRESOLVED"
    else:
        classification = "MATHEMATICAL_GROUND_TRUTH_UNRESOLVED"

    anchor_rows_decimal = [row["vector"] for row in anchors_decimal]
    anchor_rows_binary = [row["vector"] for row in anchors_binary]
    rank_x_decimal = exact_rank(x_decimal, len(data["columns"]))
    rank_x_binary = exact_rank(x_binary, len(data["columns"]))
    rank_a_decimal = exact_rank(anchor_rows_decimal, len(data["columns"]))
    rank_a_binary = exact_rank(anchor_rows_binary, len(data["columns"]))
    p = len(data["columns"])
    basis_indices = select_independent_rows(anchor_rows_decimal, [str(i) for i in range(len(anchor_rows_decimal))]) if p == 3 else []
    basis_decimal = [anchor_rows_decimal[i] for i in basis_indices]
    basis_binary = [anchor_rows_binary[i] for i in basis_indices]
    det_decimal = determinant3(basis_decimal) if len(basis_decimal) == 3 else Fraction(0)
    det_binary = determinant3(basis_binary) if len(basis_binary) == 3 else Fraction(0)

    common_row_count = sum(len(g["control_indices"]) + len(g["treated_indices"]) for g in anchors_decimal)
    common_rows = [row for g in anchors_decimal for row in (g["vector"],) * (len(g["control_indices"]) + len(g["treated_indices"]))]
    common_rank = exact_rank(common_rows, p)
    ground_record = data["record"]["ground_truth_proof"]
    record_consistent = (
        len(anchors_decimal) == ground_record["anchor_pair_count"]
        and common_row_count == ground_record["common_row_count"]
        and common_rank["rank"] == ground_record["common_row_rank"]
        and rank_a_decimal["rank"] == ground_record["anchor_matrix_rank"]
        and ground_record["anchor_pairs_exact"] is True
    )
    binary_transfer = decimal_signatures == binary_signatures and rank_a_binary["rank"] == rank_a_decimal["rank"] and rank_x_binary["rank"] == rank_x_decimal["rank"]
    proof_established = (
        p == 3 and rank_x_decimal["rank"] == p and rank_a_decimal["rank"] == p
        and rank_x_binary["rank"] == p and rank_a_binary["rank"] == p
        and det_decimal != 0 and det_binary != 0 and record_consistent and binary_transfer
    )
    if proof_established:
        classification = "MATHEMATICAL_GROUND_TRUTH_CONFIRMED"
    elif not anchors_decimal or rank_a_decimal["rank"] < p:
        classification = "MATHEMATICAL_GROUND_TRUTH_DISPUTED"
    else:
        classification = "MATHEMATICAL_GROUND_TRUTH_UNRESOLVED"

    anchor_records = []
    for group in anchors_decimal:
        anchor_records.append({
            "control_row_ids": group["control_row_ids"],
            "treated_row_ids": group["treated_row_ids"],
            "model_matrix_values_original_decimal_tokens": group["decimal_values"],
            "exact_decimal_rational_row_equality": True,
            "exact_reconstructed_binary64_row_equality": True,
            "member_of_complete_common_anchor_set": True,
        })
    selected_basis = []
    for i in basis_indices:
        group = anchors_decimal[i]
        selected_basis.append({"control_row_ids": group["control_row_ids"], "treated_row_ids": group["treated_row_ids"], "decimal_values": group["decimal_values"]})

    return {
        "fixture_id": FIXTURE_33,
        "classification": classification,
        "archived_expected_class": data["record"]["expected_separation"],
        "historical_A1_classifications": {"1e-4": "OVERLAP_FINITE_MLE", "1e-8": "QUASI_COMPLETE_SEPARATION"},
        "columns": data["columns"],
        "sample_size": len(y),
        "treatment_counts": {"control": y.count(0), "treated": y.count(1)},
        "common_anchor_groups": anchor_records,
        "common_row_count": common_row_count,
        "common_anchor_group_count": len(anchors_decimal),
        "exact_decimal_rational_ranks": {"rank_A": rank_a_decimal, "rank_X": rank_x_decimal, "rank_common_rows": common_rank},
        "exact_reconstructed_binary64_ranks": {"rank_A": rank_a_binary, "rank_X": rank_x_binary},
        "rank_A_equals_rank_X": rank_a_decimal["rank"] == rank_x_decimal["rank"] == p,
        "selected_independent_anchor_basis": selected_basis,
        "independent_determinant_certificate": {
            "decimal_rational_determinant": exact_value(det_decimal),
            "binary64_reconstructed_determinant": exact_value(det_binary),
            "both_nonzero": det_decimal != 0 and det_binary != 0,
        },
        "historical_A1_ground_truth_summary_consistent": record_consistent,
        "binary64_serialization_transfer_verified": binary_transfer,
        "mathematical_implication": "Each identical treated/control anchor row forces A_i beta = 0 for every weak separating direction. Since anchor rank equals the full column count, beta=0 is the only such direction; therefore no nonzero weak separator exists. Full column rank then gives a finite, unique logistic MLE.",
        "causal_positivity_note": "This finite-sample logistic-model result does not establish population causal positivity, common support, adequate matching, balance, or causal validity.",
    }


def summarize_a1_diagnostics(results: dict[str, Any]) -> dict[str, Any]:
    summary = {}
    for fixture_id in (FIXTURE_31, FIXTURE_33):
        record = next(row for row in results["fixtures"] if row["fixture_id"] == fixture_id)
        rows = []
        first_probe = record["detector_runs"][0]["direct_solver_probe"]
        for run in record["detector_runs"]:
            probe = run["direct_solver_probe"]
            rows.append({
                "tolerance": run["tolerance"],
                "replicate": run["replicate"],
                "package_class": run["observed_class"],
                "package_solver_configuration": run["solver_configuration"],
                "package_solver_return_code": run["solver_return_code"],
                "package_solver_failure_code": run["solver_failure_code"],
                "direct_probe_assessments": run["direct_probe_assessments"],
                "supplemental_same_solver_as_candidate": probe["same_solver_as_candidate"],
                "supplemental_independent_solver_replication": probe["independent_solver_replication"],
                "supplemental_complete_margin": {
                    "return_code": probe["complete_margin"]["return_code"],
                    "status": probe["complete_margin"]["status"],
                    "objective": probe["complete_margin"]["objective"],
                    "threshold_interpretations": probe["complete_margin"]["threshold_interpretations"],
                },
                "supplemental_weak_direction": {
                    "return_code": probe["weak_direction"]["return_code"],
                    "status": probe["weak_direction"]["status"],
                    "objective": probe["weak_direction"]["objective"],
                    "threshold_interpretations": probe["weak_direction"]["threshold_interpretations"],
                },
                "residuals_recorded_in_A1": False,
            })
        summary[fixture_id] = {
            "supplemental_formulation": first_probe["formulation"],
            "supplemental_column_scale": first_probe["column_scale"],
            "supplemental_row_scale": first_probe["row_scale"],
            "supplemental_effective_solver_control": first_probe["complete_margin"]["effective_control"],
            "runs": rows,
        }
    return summary


def build_results(zip_path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    files, archive_manifest = load_verified_archive(zip_path)
    results = parse_json_bytes(files["a1-qualification-results.json"], "a1-qualification-results.json")
    require(results["workflow_run_id"] == WORKFLOW_ID, "A1 workflow ID mismatch")
    require(results["commit_sha"] == A1_COMMIT, "A1 source commit mismatch")
    require(results["phase_baseline_sha"] == A1_PHASE_BASELINE, "A1 phase baseline mismatch")
    counts = results["counts"]
    require(counts["preregistered"] == 50 and counts["evaluated"] == 50, "A1 scenario count mismatch")
    require(counts["status"] == {"PASS": 48, "FAIL": 2, "UNMEASURED": 0}, "A1 historical counts mismatch")

    data31 = verify_fixture_inputs(files, results, FIXTURE_31)
    data33 = verify_fixture_inputs(files, results, FIXTURE_33)
    fixture_entries = []
    for data in (data31, data33):
        record = data["record"]
        fixture_entries.append({
            "fixture_id": data["fixture_id"],
            "spec_sha256": data["hashes"]["spec_sha256"],
            "input_csv_sha256": data["hashes"]["input_csv_sha256"],
            "model_matrix_sha256": data["hashes"]["model_matrix_sha256"],
            "row_order_sha256": record["row_order_sha256"],
            "response_sha256": record["response_sha256"],
            "row_count": record["sample_size"],
            "ordered_columns": record["model_matrix_columns"],
            "formula": record["formula"],
            "factor_levels": record["factor_levels"],
            "factor_reference": record["factor_reference"],
            "factor_contrasts": record["factor_contrasts"],
            "input_vs_matrix_predictor_binary64_differences": data["input_vs_matrix_predictor_binary64_differences"],
        })

    # All byte/hash/identity checks above complete before either proof runs.
    proof_results = {
        "schema": "CP-STAT-02-A2-02-EXACT-RATIONAL-PROOFS-v1",
        "evidence_verification": {
            "workflow_id": WORKFLOW_ID,
            "artifact_id": ARTIFACT_ID,
            "outer_artifact_sha256": archive_manifest["outer_zip_sha256"],
            "internal_archive_sha256": archive_manifest["internal_archive_sha256"],
            "sha256sums_entries_verified": archive_manifest["sha256sums_entries_verified"],
            "sha256sums_file_sha256": archive_manifest["sha256sums_file_sha256"],
            "unlisted_files_covered_by_internal_archive_digest": archive_manifest["unlisted_regular_files"],
            "unlisted_file_sha256": archive_manifest["unlisted_file_sha256"],
            "fixtures": fixture_entries,
        },
        "exact_arithmetic": {
            "decimal_tokens": "Parsed directly with fractions.Fraction(token); no float conversion precedes exact rational construction.",
            "binary64_reconstruction": "After decimal Fractions are constructed, exact integer/rational round-to-nearest-even reconstructs the binary64 represented by R sprintf('%.17g'); no Python float values are used.",
            "model_matrix_serialization_source": "experiments/cp-stat-02/a1/qualification.R format_number() uses sprintf('%.17g'); R session records x86_64-pc-linux-gnu, R 4.6.0.",
            "solver_dependencies_used": [],
        },
        "fixture_31": prove_fixture31(data31),
        "fixture_33": prove_fixture33(data33),
        "historical_a1_supplemental_lp_diagnostics": summarize_a1_diagnostics(results),
        "historical_a1_outcome": {
            "evaluated": 50,
            "pass": 48,
            "fail": 2,
            "unmeasured": 0,
            "general_detector": "NOT_QUALIFIED",
            "original_fixture_31_classification": "TOLERANCE_SENSITIVE_UNRESOLVED",
            "original_fixture_33_classification": "FALSE_POSITIVE",
            "scientific_outcomes_modified": False,
        },
        "product_safety": {
            "fixture_31_policy": data31["record"]["expected_product_policy"],
            "fixture_33_policy": data33["record"]["expected_product_policy"],
            "causal_positivity_established": False,
            "production_detector_qualified": False,
        },
    }
    manifest = {
        "schema": "CP-STAT-02-A2-02-PROOF-EVIDENCE-MANIFEST-v1",
        "immutable_source": {
            "workflow_id": WORKFLOW_ID,
            "artifact_id": ARTIFACT_ID,
            "outer_zip_sha256": archive_manifest["outer_zip_sha256"],
            "internal_archive_sha256": archive_manifest["internal_archive_sha256"],
            "sha256sums_verified_entries": archive_manifest["sha256sums_entries_verified"],
            "sha256sums_file_sha256": archive_manifest["sha256sums_file_sha256"],
            "sha256sums_unlisted_files": archive_manifest["unlisted_regular_files"],
            "unlisted_file_sha256": archive_manifest["unlisted_file_sha256"],
            "A1_commit_sha": A1_COMMIT,
            "A1_phase_baseline_sha": A1_PHASE_BASELINE,
        },
        "fixtures": fixture_entries,
        "historical_results": {"evaluated": 50, "pass": 48, "fail": 2, "unmeasured": 0, "detector": "NOT_QUALIFIED"},
    }
    return proof_results, manifest


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def write_manifest_hashes(manifest_path: Path, output_dir: Path) -> None:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    names = ["exact_proof.py", "proof-tests.py", "EXACT_RATIONAL_PROOF_REPORT.md", "EXACT_PROOF_DECISION.md", "proof-results.json"]
    manifest["analysis_artifacts"] = {
        name: sha256((output_dir / name).read_bytes())
        for name in names
        if (output_dir / name).is_file()
    }
    write_json(manifest_path, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-zip", required=True, type=Path, help="unmodified downloaded A1 artifact ZIP")
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    results, manifest = build_results(args.archive_zip)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    results_path = args.output_dir / "proof-results.json"
    manifest_path = args.output_dir / "proof-evidence-manifest.json"
    write_json(results_path, results)
    write_json(manifest_path, manifest)
    write_manifest_hashes(manifest_path, args.output_dir)
    print(f"Evidence verified; exact proofs written to {results_path}")
    print(f"Fixture 31: {results['fixture_31']['classification']}")
    print(f"Fixture 33: {results['fixture_33']['classification']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
