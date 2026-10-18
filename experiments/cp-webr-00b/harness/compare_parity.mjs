// CP-WEBR-00B Parity Evaluator
// Compares Native R 4.6.0 Oracle against WebR 0.6.0 Wasm across 24 Golden Fixtures

import fs from 'node:fs';

const nativeFile = 'experiments/cp-webr-00b/native-reference/native_results.json';
const webrFile = 'experiments/cp-webr-00b/webr-results/webr_results.json';
const outFile = 'experiments/cp-webr-00b/parity-results.json';

const native = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
const webr = JSON.parse(fs.readFileSync(webrFile, 'utf8'));

// Predeclared Frozen Tolerances (CP-WEBR-00B Contract)
const TOLERANCES = {
  coefficients: 1e-6,
  distance: 1e-7,
  cobalt_diff: 1e-6,
  cobalt_v_ratio: 1e-6
};

const fixtureReport = {};
let totalFixtures = 0;
let semanticPassCount = 0;
let numericPassCount = 0;

for (const [id, nat] of Object.entries(native)) {
  totalFixtures++;
  const w = webr[id];
  const report = {
    id,
    status_match: false,
    semantic_parity: false,
    numeric_parity: false,
    pair_identities_exact: false,
    weights_exact: false,
    subclasses_exact: false,
    discarded_exact: false,
    max_diffs: {
      coefficients: 0,
      distance: 0,
      cobalt_diff_un: 0,
      cobalt_diff_adj: 0,
      cobalt_v_ratio: 0
    },
    tolerance_violations: [],
    semantic_mismatches: []
  };

  if (!w) {
    report.semantic_mismatches.push('Missing in WebR results');
    fixtureReport[id] = report;
    continue;
  }

  // 1. Status match
  if (nat.status === w.status) {
    report.status_match = true;
  } else {
    report.semantic_mismatches.push(`Status mismatch: Native=${nat.status}, WebR=${w.status}`);
  }

  // If both are errors or policy rejects, status match is sufficient
  if (nat.status !== 'SUCCESS') {
    report.semantic_parity = report.status_match;
    report.numeric_parity = true; // Not applicable
    report.pair_identities_exact = true;
    report.weights_exact = true;
    report.subclasses_exact = true;
    report.discarded_exact = true;
    if (report.semantic_parity) {
      semanticPassCount++;
      numericPassCount++;
    }
    fixtureReport[id] = report;
    continue;
  }

  const nm = nat.matching;
  const wm = w.matching;

  // 2. Exact Semantic Equalities
  // A. Matched Pair Identities
  let pairsMatch = true;
  const natPairs = nm.matched_pairs || {};
  const webPairs = wm.matched_pairs || {};
  const natKeys = Object.keys(natPairs).sort();
  const webKeys = Object.keys(webPairs).sort();

  if (natKeys.length !== webKeys.length) {
    pairsMatch = false;
    report.semantic_mismatches.push(`Matched pair count: Native=${natKeys.length}, WebR=${webKeys.length}`);
  } else {
    for (const k of natKeys) {
      if (natPairs[k] !== webPairs[k]) {
        pairsMatch = false;
        report.semantic_mismatches.push(`Pair mismatch for treated ${k}: Native=${natPairs[k]}, WebR=${webPairs[k]}`);
        break;
      }
    }
  }
  report.pair_identities_exact = pairsMatch;

  // B. Discarded Units
  const natDisc = (nm.discarded || []).sort();
  const webDisc = (wm.discarded || []).sort();
  const discMatch = JSON.stringify(natDisc) === JSON.stringify(webDisc);
  report.discarded_exact = discMatch;
  if (!discMatch) report.semantic_mismatches.push(`Discarded mismatch: Native=${natDisc.length}, WebR=${webDisc.length}`);

  // C. Weights Vector
  let weightsMatch = true;
  const natW = nm.weights || {};
  const webW = wm.weights || {};
  for (const k of Object.keys(natW)) {
    if (Math.abs(natW[k] - (webW[k] ?? -1)) > 1e-12) {
      weightsMatch = false;
      report.semantic_mismatches.push(`Weight mismatch for unit ${k}: Native=${natW[k]}, WebR=${webW[k]}`);
      break;
    }
  }
  report.weights_exact = weightsMatch;

  // D. Subclasses
  let subMatch = true;
  const natSub = nm.subclass || {};
  const webSub = wm.subclass || {};
  for (const k of Object.keys(natSub)) {
    if (String(natSub[k]) !== String(webSub[k])) {
      subMatch = false;
      report.semantic_mismatches.push(`Subclass mismatch for unit ${k}: Native=${natSub[k]}, WebR=${webSub[k]}`);
      break;
    }
  }
  report.subclasses_exact = subMatch;

  report.semantic_parity = report.status_match && pairsMatch && discMatch && weightsMatch && subMatch;
  if (report.semantic_parity) semanticPassCount++;

  // 3. Numerical Tolerances
  let numericValid = true;

  // Distance differences
  const natDist = nm.distance || {};
  const webDist = wm.distance || {};
  let maxDistDiff = 0;
  for (const k of Object.keys(natDist)) {
    const diff = Math.abs(natDist[k] - (webDist[k] ?? 0));
    if (diff > maxDistDiff) maxDistDiff = diff;
  }
  report.max_diffs.distance = maxDistDiff;
  if (maxDistDiff > TOLERANCES.distance) {
    numericValid = false;
    report.tolerance_violations.push(`Distance max diff ${maxDistDiff.toExponential(3)} exceeds tolerance ${TOLERANCES.distance}`);
  }

  // Coefficient differences
  const natCoef = nm.coefficients || {};
  const webCoef = wm.coefficients || {};
  let maxCoefDiff = 0;
  for (const k of Object.keys(natCoef)) {
    if (natCoef[k] !== null && !isNaN(natCoef[k])) {
      const diff = Math.abs(natCoef[k] - (webCoef[k] ?? 0));
      if (diff > maxCoefDiff) maxCoefDiff = diff;
    }
  }
  report.max_diffs.coefficients = maxCoefDiff;
  if (maxCoefDiff > TOLERANCES.coefficients) {
    numericValid = false;
    report.tolerance_violations.push(`Coefficient max diff ${maxCoefDiff.toExponential(3)} exceeds tolerance ${TOLERANCES.coefficients}`);
  }

  // Cobalt Balance differences
  if (nat.cobalt_balance && w.cobalt_balance) {
    const nb = nat.cobalt_balance;
    const wb = w.cobalt_balance;

    // Diff.Un
    let maxDiffUn = 0;
    for (const k of Object.keys(nb.diff_un || {})) {
      const diff = Math.abs(nb.diff_un[k] - (wb.diff_un?.[k] ?? 0));
      if (diff > maxDiffUn) maxDiffUn = diff;
    }
    report.max_diffs.cobalt_diff_un = maxDiffUn;
    if (maxDiffUn > TOLERANCES.cobalt_diff) {
      numericValid = false;
      report.tolerance_violations.push(`Cobalt Diff.Un max diff ${maxDiffUn.toExponential(3)} exceeds tolerance ${TOLERANCES.cobalt_diff}`);
    }

    // Diff.Adj
    let maxDiffAdj = 0;
    for (const k of Object.keys(nb.diff_adj || {})) {
      const diff = Math.abs(nb.diff_adj[k] - (wb.diff_adj?.[k] ?? 0));
      if (diff > maxDiffAdj) maxDiffAdj = diff;
    }
    report.max_diffs.cobalt_diff_adj = maxDiffAdj;
    if (maxDiffAdj > TOLERANCES.cobalt_diff) {
      numericValid = false;
      report.tolerance_violations.push(`Cobalt Diff.Adj max diff ${maxDiffAdj.toExponential(3)} exceeds tolerance ${TOLERANCES.cobalt_diff}`);
    }

    // Variance Ratios
    let maxVR = 0;
    for (const k of Object.keys(nb.v_ratio_adj || {})) {
      if (nb.v_ratio_adj[k] !== null && !isNaN(nb.v_ratio_adj[k])) {
        const diff = Math.abs(nb.v_ratio_adj[k] - (wb.v_ratio_adj?.[k] ?? 0));
        if (diff > maxVR) maxVR = diff;
      }
    }
    report.max_diffs.cobalt_v_ratio = maxVR;
    if (maxVR > TOLERANCES.cobalt_v_ratio) {
      numericValid = false;
      report.tolerance_violations.push(`Cobalt V.Ratio max diff ${maxVR.toExponential(3)} exceeds tolerance ${TOLERANCES.cobalt_v_ratio}`);
    }
  }

  report.numeric_parity = numericValid;
  if (report.numeric_parity) numericPassCount++;

  fixtureReport[id] = report;
}

const summary = {
  evaluated_at: new Date().toISOString(),
  total_fixtures: totalFixtures,
  semantic_pass_count: semanticPassCount,
  numeric_pass_count: numericPassCount,
  all_fixtures_pass: (semanticPassCount === totalFixtures) && (numericPassCount === totalFixtures),
  tolerances_used: TOLERANCES,
  fixture_details: fixtureReport
};

fs.writeFileSync(outFile, JSON.stringify(summary, null, 2));
console.log(`\nPARITY EVALUATION SUMMARY:`);
console.log(`Total Fixtures: ${totalFixtures}`);
console.log(`Semantic Parity Passes: ${semanticPassCount}/${totalFixtures} (${(semanticPassCount/totalFixtures*100).toFixed(1)}%)`);
console.log(`Numerical Parity Passes: ${numericPassCount}/${totalFixtures} (${(numericPassCount/totalFixtures*100).toFixed(1)}%)`);
console.log(`All Fixtures Pass: ${summary.all_fixtures_pass ? 'YES' : 'NO'}`);
