// CP-WEBR-00B R1 Comparator Mutation & Negative Test Suite
// Verifies that comparator demonstrably FAILS on every major assertion mutation

import fs from 'node:fs';
import { compareFixture, TOLERANCES } from './compare_parity.mjs';

const nativeFile = 'experiments/cp-webr-00b/native-reference/native_results.json';
const webrFile = 'experiments/cp-webr-00b/webr-results/webr_results.json';

const native = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
const webr = JSON.parse(fs.readFileSync(webrFile, 'utf8'));

// Baseline fixture for mutation tests: fix_01_well_conditioned
const baseNat = native['fix_01_well_conditioned'];
const baseWeb = webr['fix_01_well_conditioned'];

const mutations = [
  {
    id: "MUT_01_EXTRA_KEY_PAIRS",
    name: "Extra key in WebR matched pairs",
    mutate: (w) => {
      w.matching.matched_pairs["extra_unit_9999"] = "sub_0001";
    },
    expectedErrorMatch: /Extra unexpected keys in WebR: \[extra_unit_9999\]/
  },
  {
    id: "MUT_02_MISSING_KEY_PAIRS",
    name: "Missing key in WebR matched pairs",
    mutate: (w) => {
      const firstKey = Object.keys(w.matching.matched_pairs)[0];
      delete w.matching.matched_pairs[firstKey];
    },
    expectedErrorMatch: /Missing keys in WebR/
  },
  {
    id: "MUT_03_CHANGED_PAIR_IDENTITY",
    name: "Altered matched control ID",
    mutate: (w) => {
      const firstKey = Object.keys(w.matching.matched_pairs)[0];
      w.matching.matched_pairs[firstKey] = "sub_9999";
    },
    expectedErrorMatch: /Matched pair mismatch for treated/
  },
  {
    id: "MUT_04_ALTERED_WEIGHT",
    name: "Altered matching weight",
    mutate: (w) => {
      const firstKey = Object.keys(w.matching.weights)[0];
      w.matching.weights[firstKey] += 0.5;
    },
    expectedErrorMatch: /Weight unit.*Diff.*exceeds tolerance/
  },
  {
    id: "MUT_05_FACTOR_LEVEL_DRIFT",
    name: "Model matrix colnames / factor level drift",
    mutate: (w) => {
      w.matching.model_matrix_colnames[1] = "x_cat_mutated";
    },
    expectedErrorMatch: /Model matrix colnames mismatch/
  },
  {
    id: "MUT_06_WRONG_WARNING_CATEGORY",
    name: "Mismatched warning category",
    mutate: (w) => {
      w.warning_categories = ["FAKE_WARNING_CATEGORY"];
    },
    expectedErrorMatch: /Warning categories mismatch/
  },
  {
    id: "MUT_07_NONFINITE_VALUE",
    name: "Non-finite NaN or Infinity value",
    mutate: (w) => {
      const firstKey = Object.keys(w.matching.distance)[0];
      w.matching.distance[firstKey] = "Infinity";
    },
    expectedErrorMatch: /Non-numeric string mismatch|Non-finite/
  },
  {
    id: "MUT_08_MISSING_COBALT_ROW",
    name: "Missing cobalt balance covariate row",
    mutate: (w) => {
      delete w.cobalt_balance_raw.diff_un["age"];
    },
    expectedErrorMatch: /Missing keys in WebR/
  },
  {
    id: "MUT_09_WRONG_STATUS",
    name: "Mismatched overall status",
    mutate: (w) => {
      w.status = "UNEXPECTED_FAILURE";
    },
    expectedErrorMatch: /Status mismatch/
  },
  {
    id: "MUT_10_GLM_CONVERGENCE_MISMATCH",
    name: "GLM convergence state mismatch",
    mutate: (w) => {
      w.matching.converged = !w.matching.converged;
    },
    expectedErrorMatch: /GLM convergence mismatch/
  },
  {
    id: "MUT_11_GLM_RANK_DEFICIENT_MISMATCH",
    name: "GLM model rank mismatch",
    mutate: (w) => {
      w.matching.rank += 1;
    },
    expectedErrorMatch: /GLM rank mismatch/
  },
  {
    id: "MUT_12_DISCARDED_UNITS_MISMATCH",
    name: "Discarded units partition mismatch",
    mutate: (w) => {
      w.matching.discarded = ["sub_0001"];
    },
    expectedErrorMatch: /Discarded units mismatch/
  }
];

console.log(`\n======================================================`);
console.log(`RUNNING COMPARATOR MUTATION & NEGATIVE FALSIFICATION TESTS`);
console.log(`======================================================\n`);

let passCount = 0;
const results = [];

for (const m of mutations) {
  // Deep clone WebR object
  const webClone = JSON.parse(JSON.stringify(baseWeb));
  m.mutate(webClone);

  const cmp = compareFixture(baseNat, webClone, TOLERANCES);
  const caught = !cmp.semantic_parity || !cmp.numeric_parity;
  const matchedError = cmp.errors.some(e => m.expectedErrorMatch.test(e));

  const passed = caught && matchedError;
  if (passed) passCount++;

  results.push({
    id: m.id,
    name: m.name,
    demonstrably_failed: caught,
    error_matched: matchedError,
    errors_emitted: cmp.errors.slice(0, 2),
    verdict: passed ? "PASS" : "FAIL"
  });

  console.log(`${passed ? "✓ PASS" : "✗ FAIL"} [${m.id}] ${m.name}`);
  if (!passed) {
    console.error(`  Expected error matching: ${m.expectedErrorMatch}`);
    console.error(`  Actual errors:`, cmp.errors);
  }
}

const allPassed = passCount === mutations.length;
console.log(`\nMUTATION TEST SUMMARY: ${passCount}/${mutations.length} mutations demonstrably detected and caught.`);
console.log(`Comparator Falsification Verdict: ${allPassed ? "PASS" : "FAIL"}`);

let existingTimestamp = "2026-10-19T10:24:00Z";
const mutOutFile = 'experiments/cp-webr-00b/comparator-mutation-results.json';
if (fs.existsSync(mutOutFile)) {
  try {
    const existing = JSON.parse(fs.readFileSync(mutOutFile, 'utf8'));
    if (existing.tested_at) existingTimestamp = existing.tested_at;
  } catch {}
}

fs.writeFileSync(mutOutFile, JSON.stringify({
  tested_at: process.env.EVAL_TIMESTAMP || existingTimestamp,
  mutation_count: mutations.length,
  passed_count: passCount,
  all_mutations_caught: allPassed,
  mutations: results
}, null, 2) + '\n');

if (!allPassed) process.exit(1);
