#!/usr/bin/env python3
"""Offline integrity and falsification tests for the two exact proofs."""

from __future__ import annotations

import argparse
import copy
import csv
import io
import json
import sys
import unittest
from fractions import Fraction
from pathlib import Path

from exact_proof import (
    FIXTURE_31,
    FIXTURE_33,
    EvidenceError,
    anchor_groups,
    build_results,
    exact_rank,
    fraction,
    load_verified_archive,
    nearest_binary64_fraction,
    parse_json_bytes,
    prove_fixture31,
    prove_fixture33,
    strict_witness,
    verify_fixture_inputs,
    verify_recorded_matrix,
    verify_recorded_response,
)


EVIDENCE: dict[str, object] = {}


class ExactProofTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.files = EVIDENCE["files"]
        cls.results = EVIDENCE["results"]
        cls.data31 = EVIDENCE["data31"]
        cls.data33 = EVIDENCE["data33"]

    def test_original_exact_proofs_succeed(self) -> None:
        proof31 = prove_fixture31(self.data31)
        proof33 = prove_fixture33(self.data33)
        self.assertEqual(proof31["classification"], "MATHEMATICAL_GROUND_TRUTH_CONFIRMED")
        self.assertEqual(proof33["classification"], "MATHEMATICAL_GROUND_TRUTH_CONFIRMED")
        self.assertEqual(proof31["minimum_margin"]["row_id"], "sub_0018")
        self.assertEqual(proof33["exact_decimal_rational_ranks"]["rank_A"]["rank"], 3)

    def test_binary64_reconstruction_known_exact_values(self) -> None:
        self.assertEqual(nearest_binary64_fraction(Fraction(1, 2)), Fraction(1, 2))
        self.assertEqual(
            nearest_binary64_fraction(Fraction("0.1")),
            Fraction(3602879701896397, 36028797018963968),
        )
        self.assertEqual(
            nearest_binary64_fraction(Fraction("1.0000000000000001e-5")),
            Fraction(5902958103587057, 590295810358705651712),
        )

    def test_fixture31_response_reversal_invalidates_witness(self) -> None:
        x = [[fraction(row[c]) for c in self.data31["columns"]] for row in self.data31["matrix_rows"]]
        y = self.data31["response"][:]
        index = next(i for i, response in enumerate(y) if response == 1)
        y[index] = 0
        margins = strict_witness(x, y, [Fraction(0), Fraction(1), Fraction(0)])
        self.assertLess(min(margins), 0)

    def test_fixture31_zeroed_witness_component_is_rejected(self) -> None:
        x = [[fraction(row[c]) for c in self.data31["columns"]] for row in self.data31["matrix_rows"]]
        margins = strict_witness(x, self.data31["response"], [Fraction(0), Fraction(0), Fraction(0)])
        self.assertEqual(margins, [])

    def test_fixture31_corrupted_decimal_token_is_integrity_rejected(self) -> None:
        mutated = dict(self.files)
        path = f"model-matrices/{FIXTURE_31}.csv"
        original = mutated[path]
        token = b"1.6629985272884368e-06"
        self.assertIn(token, original)
        mutated[path] = original.replace(token, b"-1.6629985272884368e-06", 1)
        with self.assertRaises(EvidenceError):
            verify_fixture_inputs(mutated, self.results, FIXTURE_31)

    def test_fixture31_removed_observation_is_integrity_rejected(self) -> None:
        mutated = dict(self.files)
        path = f"model-matrices/{FIXTURE_31}.csv"
        lines = mutated[path].splitlines(keepends=True)
        self.assertEqual(len(lines), 81)
        mutated[path] = b"".join(lines[:-1])
        with self.assertRaises(EvidenceError):
            verify_fixture_inputs(mutated, self.results, FIXTURE_31)

    def test_fixture33_changed_common_anchor_row_breaks_equality(self) -> None:
        rows = copy.deepcopy(self.data33["matrix_rows"])
        row_by_id = {row["row_id"]: row for row in rows}
        before = [fraction(row_by_id[rid]["x1"]) for rid in ("sub_0001", "sub_0002")]
        self.assertEqual(before[0], before[1])
        row_by_id["sub_0002"]["x1"] = "1e-6"
        after = [fraction(row_by_id[rid]["x1"]) for rid in ("sub_0001", "sub_0002")]
        self.assertNotEqual(after[0], after[1])
        groups = anchor_groups(rows, self.data33["columns"], self.data33["row_ids"], self.data33["response"])
        self.assertFalse(any("sub_0001" in g["control_row_ids"] and "sub_0002" in g["treated_row_ids"] for g in groups))

    def test_fixture33_broken_opposite_treatment_pair_is_rejected(self) -> None:
        y = self.data33["response"][:]
        ids = self.data33["row_ids"]
        control_index, treated_index = ids.index("sub_0001"), ids.index("sub_0002")
        y[treated_index] = y[control_index]
        groups = anchor_groups(self.data33["matrix_rows"], self.data33["columns"], ids, y)
        self.assertFalse(any("sub_0001" in g["control_row_ids"] and "sub_0002" in g["treated_row_ids"] for g in groups))
        with self.assertRaises(EvidenceError):
            verify_recorded_response(self.data33["record"], ids, y)

    def test_fixture33_removing_anchor_rows_removes_spanning_certificate(self) -> None:
        groups = anchor_groups(self.data33["matrix_rows"], self.data33["columns"], self.data33["row_ids"], self.data33["response"])
        anchor_vectors = {tuple(g["vector"]) for g in groups}
        keep = []
        keep_ids = []
        keep_y = []
        for i, row in enumerate(self.data33["matrix_rows"]):
            vector = tuple(fraction(row[c]) for c in self.data33["columns"])
            if vector not in anchor_vectors:
                keep.append(list(vector))
                keep_ids.append(self.data33["row_ids"][i])
                keep_y.append(self.data33["response"][i])
        remaining = anchor_groups(
            [self.data33["matrix_rows"][i] for i, row in enumerate(self.data33["matrix_rows"])
             if tuple(fraction(row[c]) for c in self.data33["columns"]) not in anchor_vectors],
            self.data33["columns"], keep_ids, keep_y,
        )
        self.assertEqual(remaining, [])
        self.assertEqual(exact_rank(keep, len(self.data33["columns"]))["rank"], 3)

    def test_fixture33_altered_column_identity_is_integrity_rejected(self) -> None:
        record = copy.deepcopy(self.data33["record"])
        record["model_matrix_columns"][1] = "x1_altered"
        with self.assertRaises(EvidenceError):
            verify_recorded_matrix(record, ["row_id"] + self.data33["columns"], self.data33["matrix_rows"])

    def test_fixture33_row_response_reassignment_is_integrity_rejected(self) -> None:
        ids = self.data33["row_ids"]
        y = self.data33["response"][:]
        anchor_index = ids.index("sub_0001")
        non_anchor_index = next(i for i, row_id in enumerate(ids)
                                if row_id not in {"sub_0001", "sub_0002", "sub_0003", "sub_0004", "sub_0005", "sub_0006"}
                                and y[i] == 1)
        y[anchor_index], y[non_anchor_index] = y[non_anchor_index], y[anchor_index]
        with self.assertRaises(EvidenceError):
            verify_recorded_response(self.data33["record"], ids, y)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive-zip", required=True, type=Path)
    args = parser.parse_args()
    files, archive_manifest = load_verified_archive(args.archive_zip)
    results = parse_json_bytes(files["a1-qualification-results.json"], "a1-qualification-results.json")
    EVIDENCE["files"] = files
    EVIDENCE["results"] = results
    EVIDENCE["data31"] = verify_fixture_inputs(files, results, FIXTURE_31)
    EVIDENCE["data33"] = verify_fixture_inputs(files, results, FIXTURE_33)
    del archive_manifest
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(ExactProofTests)
    outcome = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if outcome.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
