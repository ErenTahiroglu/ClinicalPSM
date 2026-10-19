// CP-WEBR-00B R1 Parity Comparator
// Strict, symmetric comparator between Native R 4.6.0 Oracle and WebR 0.6.0 Wasm

import fs from 'node:fs';

export const TOLERANCES = {
  coefficients: 1e-6,
  distance: 1e-7,
  cobalt_diff: 1e-6,
  cobalt_v_ratio: 1e-6
};

// Check that set of keys on both objects are strictly identical
export function assertExactKeySet(objA, objB, context) {
  const keysA = Object.keys(objA || {}).sort();
  const keysB = Object.keys(objB || {}).sort();

  const missingInB = keysA.filter(k => !(k in (objB || {})));
  const extraInB = keysB.filter(k => !(k in (objA || {})));

  const errors = [];
  if (missingInB.length > 0) {
    errors.push(`${context}: Missing keys in WebR: [${missingInB.join(', ')}]`);
  }
  if (extraInB.length > 0) {
    errors.push(`${context}: Extra unexpected keys in WebR: [${extraInB.join(', ')}]`);
  }
  return errors;
}

// Compare two values with strict non-finite checking
export function compareValues(valA, valB, tolerance, context, allowNA = false) {
  // If string "NA", "NaN", "Inf", "-Inf"
  if (typeof valA === 'string' || typeof valB === 'string') {
    if (valA === valB) return { match: true, diff: 0, error: null };
    if (allowNA && (valA === 'NA' || valB === 'NA')) {
      return { match: valA === valB, diff: 0, error: `${context}: NA mismatch: Native=${valA}, WebR=${valB}` };
    }
    return { match: false, diff: 0, error: `${context}: Non-numeric string mismatch: Native=${valA}, WebR=${valB}` };
  }

  // Reject unexpected NaN or Infinity
  if (!Number.isFinite(valA) && !allowNA) {
    return { match: false, diff: NaN, error: `${context}: Non-finite Native value: ${valA}` };
  }
  if (!Number.isFinite(valB) && !allowNA) {
    return { match: false, diff: NaN, error: `${context}: Non-finite WebR value: ${valB}` };
  }

  if (Number.isNaN(valA) || Number.isNaN(valB)) {
    const match = Number.isNaN(valA) && Number.isNaN(valB);
    return { match, diff: match ? 0 : NaN, error: match ? null : `${context}: NaN mismatch` };
  }

  const diff = Math.abs(valA - valB);
  if (diff > tolerance) {
    return { match: false, diff, error: `${context}: Diff ${diff.toExponential(3)} exceeds tolerance ${tolerance}` };
  }
  return { match: true, diff, error: null };
}

export function compareFixture(nat, web, tolerances = TOLERANCES) {
  const errors = [];
  const maxDiffs = {
    coefficients: 0,
    distance: 0,
    cobalt_raw_diff_un: 0,
    cobalt_raw_diff_adj: 0,
    cobalt_raw_v_ratio: 0,
    cobalt_std_diff_un: 0,
    cobalt_std_diff_adj: 0,
    cobalt_std_v_ratio: 0
  };

  if (!web) {
    return {
      status_match: false,
      semantic_parity: false,
      numeric_parity: false,
      errors: ['Missing fixture in WebR results'],
      maxDiffs
    };
  }

  // 1. Status and Failure Classification Match
  const statusMatch = nat.status === web.status;
  if (!statusMatch) {
    errors.push(`Status mismatch: Native=${nat.status}, WebR=${web.status}`);
  }

  // Warning categories
  const normalizeArray = x => (Array.isArray(x) ? x.slice().sort() : (x ? [x] : []));
  const natWarnCats = normalizeArray(nat.warning_categories);
  const webWarnCats = normalizeArray(web.warning_categories);
  if (JSON.stringify(natWarnCats) !== JSON.stringify(webWarnCats)) {
    errors.push(`Warning categories mismatch: Native=[${natWarnCats.join(', ')}], WebR=[${webWarnCats.join(', ')}]`);
  }

  // Error category
  if (nat.error_category !== web.error_category) {
    errors.push(`Error category mismatch: Native=${nat.error_category}, WebR=${web.error_category}`);
  }

  // ClinicalPSM Policy match
  if (nat.clinicalpsm_policy !== web.clinicalpsm_policy) {
    errors.push(`ClinicalPSM policy mismatch: Native=${nat.clinicalpsm_policy}, WebR=${web.clinicalpsm_policy}`);
  }

  // If both failed as expected errors or policy rejects, verify no spurious matching payload
  if (nat.status === 'EXPECTED_REFERENCE_ERROR' || nat.status === 'CLINICALPSM_POLICY_REJECT') {
    if (web.matching) {
      errors.push(`Unexpected matching payload in WebR for failed fixture: ${nat.status}`);
    }
    return {
      status_match: statusMatch,
      semantic_parity: errors.length === 0,
      numeric_parity: true,
      is_expected_failure: true,
      errors,
      maxDiffs
    };
  }

  // 2. Strict GLM Model Checks
  const nm = nat.matching;
  const wm = web.matching;
  if (!nm || !wm) {
    errors.push(`Missing matching object: Native=${!!nm}, WebR=${!!wm}`);
    return { status_match: statusMatch, semantic_parity: false, numeric_parity: false, errors, maxDiffs };
  }

  // Convergence & Rank
  if (nm.converged !== wm.converged) {
    errors.push(`GLM convergence mismatch: Native=${nm.converged}, WebR=${wm.converged}`);
  }
  if (nm.rank !== wm.rank) {
    errors.push(`GLM rank mismatch: Native=${nm.rank}, WebR=${wm.rank}`);
  }

  // Model matrix colnames
  if (JSON.stringify(nm.model_matrix_colnames) !== JSON.stringify(wm.model_matrix_colnames)) {
    errors.push(`Model matrix colnames mismatch: Native=[${nm.model_matrix_colnames}], WebR=[${wm.model_matrix_colnames}]`);
  }

  // Aliased parameters
  const aliasKeyErrors = assertExactKeySet(nm.aliased, wm.aliased, 'GLM Aliased Keys');
  errors.push(...aliasKeyErrors);
  if (aliasKeyErrors.length === 0) {
    for (const k of Object.keys(nm.aliased || {})) {
      if (nm.aliased[k] !== wm.aliased[k]) {
        errors.push(`Aliased parameter mismatch for ${k}: Native=${nm.aliased[k]}, WebR=${wm.aliased[k]}`);
      }
    }
  }

  // 3. Matched Pairs, Weights, Subclasses, Discarded
  // Discarded
  const natDisc = (nm.discarded || []).slice().sort();
  const webDisc = (wm.discarded || []).slice().sort();
  if (JSON.stringify(natDisc) !== JSON.stringify(webDisc)) {
    errors.push(`Discarded units mismatch: Native=[${natDisc.join(', ')}], WebR=[${webDisc.join(', ')}]`);
  }

  // Pair identities (symmetric check)
  const pairKeyErrors = assertExactKeySet(nm.matched_pairs, wm.matched_pairs, 'Matched Pairs Keys');
  errors.push(...pairKeyErrors);
  if (pairKeyErrors.length === 0) {
    for (const [tId, cId] of Object.entries(nm.matched_pairs || {})) {
      if (cId !== wm.matched_pairs[tId]) {
        errors.push(`Matched pair mismatch for treated ${tId}: Native=${cId}, WebR=${wm.matched_pairs[tId]}`);
      }
    }
  }

  // Weights (symmetric check)
  const weightKeyErrors = assertExactKeySet(nm.weights, wm.weights, 'Weights Keys');
  errors.push(...weightKeyErrors);
  if (weightKeyErrors.length === 0) {
    for (const [id, wNat] of Object.entries(nm.weights || {})) {
      const cmp = compareValues(wNat, wm.weights[id], 1e-12, `Weight unit ${id}`);
      if (!cmp.match) errors.push(cmp.error);
    }
  }

  // Subclasses (symmetric check)
  const subKeyErrors = assertExactKeySet(nm.subclass, wm.subclass, 'Subclass Keys');
  errors.push(...subKeyErrors);
  if (subKeyErrors.length === 0) {
    for (const [id, sNat] of Object.entries(nm.subclass || {})) {
      if (String(sNat) !== String(wm.subclass[id])) {
        errors.push(`Subclass mismatch for unit ${id}: Native=${sNat}, WebR=${wm.subclass[id]}`);
      }
    }
  }

  // 4. Numerical Parity: Coefficients & Distances
  // Coefficients
  const coefKeyErrors = assertExactKeySet(nm.coefficients, wm.coefficients, 'Coefficients Keys');
  errors.push(...coefKeyErrors);
  if (coefKeyErrors.length === 0) {
    for (const [k, cNat] of Object.entries(nm.coefficients || {})) {
      const cmp = compareValues(cNat, wm.coefficients[k], tolerances.coefficients, `Coeff ${k}`, true);
      if (cmp.diff > maxDiffs.coefficients) maxDiffs.coefficients = cmp.diff;
      if (!cmp.match) errors.push(cmp.error);
    }
  }

  // Distance (symmetric check)
  const distKeyErrors = assertExactKeySet(nm.distance, wm.distance, 'Distance Keys');
  errors.push(...distKeyErrors);
  if (distKeyErrors.length === 0) {
    for (const [id, dNat] of Object.entries(nm.distance || {})) {
      const cmp = compareValues(dNat, wm.distance[id], tolerances.distance, `Distance unit ${id}`);
      if (cmp.diff > maxDiffs.distance) maxDiffs.distance = cmp.diff;
      if (!cmp.match) errors.push(cmp.error);
    }
  }

  // 5. Cobalt Balance Diagnostics: Both raw and std binary
  const compareCobaltSection = (balNat, balWeb, mode) => {
    if (!balNat && !balWeb) return;
    if (!balNat || !balWeb) {
      errors.push(`Cobalt balance (${mode}) presence mismatch: Native=${!!balNat}, WebR=${!!balWeb}`);
      return;
    }

    // Covariates list & types
    if (JSON.stringify(balNat.covariates) !== JSON.stringify(balWeb.covariates)) {
      errors.push(`Cobalt (${mode}) covariates list mismatch: Native=[${balNat.covariates}], WebR=[${balWeb.covariates}]`);
    }
    if (JSON.stringify(balNat.type) !== JSON.stringify(balWeb.type)) {
      errors.push(`Cobalt (${mode}) variable types mismatch: Native=[${balNat.type}], WebR=[${balWeb.type}]`);
    }

    // Diff.Un
    const unKeyErrors = assertExactKeySet(balNat.diff_un, balWeb.diff_un, `Cobalt (${mode}) Diff.Un Keys`);
    errors.push(...unKeyErrors);
    if (unKeyErrors.length === 0) {
      for (const [k, vNat] of Object.entries(balNat.diff_un || {})) {
        const cmp = compareValues(vNat, balWeb.diff_un[k], tolerances.cobalt_diff, `Cobalt (${mode}) Diff.Un ${k}`, true);
        const diffKey = `cobalt_${mode}_diff_un`;
        if (cmp.diff > maxDiffs[diffKey]) maxDiffs[diffKey] = cmp.diff;
        if (!cmp.match) errors.push(cmp.error);
      }
    }

    // Diff.Adj
    const adjKeyErrors = assertExactKeySet(balNat.diff_adj, balWeb.diff_adj, `Cobalt (${mode}) Diff.Adj Keys`);
    errors.push(...adjKeyErrors);
    if (adjKeyErrors.length === 0) {
      for (const [k, vNat] of Object.entries(balNat.diff_adj || {})) {
        const cmp = compareValues(vNat, balWeb.diff_adj[k], tolerances.cobalt_diff, `Cobalt (${mode}) Diff.Adj ${k}`, true);
        const diffKey = `cobalt_${mode}_diff_adj`;
        if (cmp.diff > maxDiffs[diffKey]) maxDiffs[diffKey] = cmp.diff;
        if (!cmp.match) errors.push(cmp.error);
      }
    }

    // Variance Ratios
    if (balNat.v_ratio_adj && Object.keys(balNat.v_ratio_adj).length > 0) {
      const vrKeyErrors = assertExactKeySet(balNat.v_ratio_adj, balWeb.v_ratio_adj, `Cobalt (${mode}) V.Ratio Keys`);
      errors.push(...vrKeyErrors);
      if (vrKeyErrors.length === 0) {
        for (const [k, vNat] of Object.entries(balNat.v_ratio_adj || {})) {
          const cmp = compareValues(vNat, balWeb.v_ratio_adj[k], tolerances.cobalt_v_ratio, `Cobalt (${mode}) V.Ratio ${k}`, true);
          const diffKey = `cobalt_${mode}_v_ratio`;
          if (cmp.diff > maxDiffs[diffKey]) maxDiffs[diffKey] = cmp.diff;
          if (!cmp.match) errors.push(cmp.error);
        }
      }
    }
  };

  compareCobaltSection(nat.cobalt_balance_raw, web.cobalt_balance_raw, 'raw');
  compareCobaltSection(nat.cobalt_balance_std, web.cobalt_balance_std, 'std');

  const semanticErrors = errors.filter(e => !e.includes('exceeds tolerance'));
  const numericErrors = errors.filter(e => e.includes('exceeds tolerance'));

  return {
    status_match: statusMatch,
    semantic_parity: semanticErrors.length === 0,
    numeric_parity: numericErrors.length === 0,
    is_expected_failure: false,
    errors,
    maxDiffs
  };
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const nativeFile = 'experiments/cp-webr-00b/native-reference/native_results.json';
  const webrFile = 'experiments/cp-webr-00b/webr-results/webr_results.json';
  const outFile = 'experiments/cp-webr-00b/parity-results.json';

  const native = JSON.parse(fs.readFileSync(nativeFile, 'utf8'));
  const webr = JSON.parse(fs.readFileSync(webrFile, 'utf8'));

  const fixtureReport = {};
  let total = 0;
  let semanticPass = 0;
  let numericPass = 0;

  for (const [id, nat] of Object.entries(native)) {
    total++;
    const res = compareFixture(nat, webr[id], TOLERANCES);
    fixtureReport[id] = res;
    if (res.semantic_parity) semanticPass++;
    if (res.numeric_parity) numericPass++;
  }

  const allPass = (semanticPass === total) && (numericPass === total);
  const summary = {
    evaluated_at: new Date().toISOString(),
    total_fixtures: total,
    semantic_pass_count: semanticPass,
    numeric_pass_count: numericPass,
    all_fixtures_pass: allPass,
    tolerances_used: TOLERANCES,
    fixture_details: fixtureReport
  };

  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2) + '\n');
  console.log(`\nSTRICT SYMMETRIC PARITY EVALUATION:`);
  console.log(`Total Fixtures: ${total}`);
  console.log(`Semantic Parity Passes: ${semanticPass}/${total} (${(semanticPass / total * 100).toFixed(1)}%)`);
  console.log(`Numeric Parity Passes: ${numericPass}/${total} (${(numericPass / total * 100).toFixed(1)}%)`);
  console.log(`Overall Pass: ${allPass ? 'YES' : 'NO'}`);
}
