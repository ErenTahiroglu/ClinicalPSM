// CP-WEBR-02A Canonical Serializer, Runtime Schema Validator & Defensive Boundary
// Conforms to CP-WEBR-01 Canonical Result Contract Section 4 & Production Architecture Section 4.4 & R1.1 Requirements

/**
 * Computes SHA-256 hex digest using Web Crypto API in browser/Node or dynamic import fallback
 */
export async function sha256Hex(text) {
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Recursively clones and sorts object keys lexicographically for canonical serialization
 */
export function canonicalizeValue(val) {
  if (val === null || val === undefined) {
    return null;
  }
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) {
      return null;
    }
    return val;
  }
  if (typeof val === 'boolean' || typeof val === 'string') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => canonicalizeValue(item));
  }
  if (typeof val === 'object') {
    const sortedKeys = Object.keys(val).sort();
    const result = {};
    for (const k of sortedKeys) {
      result[k] = canonicalizeValue(val[k]);
    }
    return result;
  }
  return String(val);
}

/**
 * Creates a defensive copy of a CanonicalPsmResult
 */
export function defensiveClone(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      return null;
    }
    return value;
  }));
}

/**
 * Deep freezes an object to enforce consumer boundary immutability
 */
export function deepFreeze(obj) {
  if (obj === null || obj === undefined) return obj;
  Object.freeze(obj);
  for (const key of Object.getOwnPropertyNames(obj)) {
    const val = obj[key];
    if (val !== null && (typeof val === 'object' || typeof val === 'function') && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/**
 * Serializes canonical result into a deterministic JSON string
 */
export function serializeCanonical(obj) {
  const canonical = canonicalizeValue(obj);
  return JSON.stringify(canonical);
}

/**
 * Computes non-self-referential canonical result hash over scientific payload
 */
export async function computeCanonicalResultHash(resultPayload) {
  const copy = defensiveClone(resultPayload);
  if (copy.inputFingerprint) {
    copy.inputFingerprint.canonicalResultSha256 = null;
  }
  const canonicalJson = serializeCanonical(copy);
  return await sha256Hex(canonicalJson);
}

/**
 * Validates complete CanonicalPsmResult runtime schema and mathematical invariants
 */
export function validateCanonicalResult(result) {
  if (!result || typeof result !== 'object') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Result must be a non-null object');
  }

  // 1. Metadata
  if (!result.metadata || typeof result.metadata.runId !== 'string' || !result.metadata.timestamp) {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing or invalid metadata in CanonicalPsmResult');
  }

  // 2. Input Fingerprint
  const fp = result.inputFingerprint;
  if (!fp || typeof fp.totalRows !== 'number' || typeof fp.completeCases !== 'number' || typeof fp.excludedRows !== 'number') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing inputFingerprint accounting numbers');
  }
  if (fp.completeCases + fp.excludedRows !== fp.totalRows) {
    throw new Error(`INVARIANT_VIOLATION: completeCases (${fp.completeCases}) + excludedRows (${fp.excludedRows}) != totalRows (${fp.totalRows})`);
  }
  if (!fp.datasetSha256 || fp.datasetSha256.length !== 64) {
    throw new Error('SCHEMA_VALIDATION_ERROR: datasetSha256 must be a 64-character hex string');
  }

  // 3. Toolchain
  const tc = result.toolchain;
  if (!tc || tc.webrVersion !== '0.6.0' || tc.rVersion !== '4.6.0' || tc.matchItVersion !== '4.8.1' || tc.cobaltVersion !== '5.0.0') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Invalid toolchain version specification');
  }

  // 4. Matching Configuration
  const mc = result.matchingConfiguration;
  if (!mc || !mc.treatmentVariable || !Array.isArray(mc.covariates) || mc.covariates.length === 0) {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing matchingConfiguration variables');
  }
  if (mc.method !== 'nearest' || mc.ratio !== 1 || mc.replace !== false || mc.matchingOrder !== 'largest') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Matching configuration parameters violate locked 1:1 nearest protocol');
  }
  if (!['linear.logit', 'logit'].includes(mc.distanceMetric)) {
    throw new Error(`SCHEMA_VALIDATION_ERROR: Invalid distanceMetric: ${mc.distanceMetric}`);
  }
  if (typeof mc.stdCaliper !== 'boolean') {
    throw new Error('SCHEMA_VALIDATION_ERROR: stdCaliper must be boolean');
  }

  // 5. Propensity Scores & Vector Length Invariants
  const ps = result.propensityScores;
  if (!ps || !Array.isArray(ps.unitIds) || !Array.isArray(ps.treatment) || !Array.isArray(ps.propensityScores) || !Array.isArray(ps.linearLogits)) {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing propensityScores arrays');
  }
  const N = fp.completeCases;
  if (ps.unitIds.length !== N || ps.treatment.length !== N || ps.propensityScores.length !== N || ps.linearLogits.length !== N) {
    throw new Error(`INVARIANT_VIOLATION: Propensity score vectors length (${ps.unitIds.length}) does not match complete cases count (${N})`);
  }

  for (let i = 0; i < N; i++) {
    const t = ps.treatment[i];
    if (t !== 0 && t !== 1) {
      throw new Error(`INVARIANT_VIOLATION: Non-binary treatment indicator at unit ${ps.unitIds[i]}: ${t}`);
    }
    const score = ps.propensityScores[i];
    if (typeof score !== 'number' || score < 0 || score > 1 || !Number.isFinite(score)) {
      throw new Error(`INVARIANT_VIOLATION: Propensity score outside [0, 1] at unit ${ps.unitIds[i]}: ${score}`);
    }
  }

  // 6. Matched Units & Pairs Invariants
  const mu = result.matchedUnits;
  const mm = result.matchMatrix;
  if (!mu || !mm || typeof mu.totalMatchedPairs !== 'number') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing matchedUnits or matchMatrix');
  }
  const pairs = mu.totalMatchedPairs;
  if (mu.matchedTreatedIds.length !== pairs || mu.matchedControlIds.length !== pairs || mm.pairDistances.length !== pairs) {
    throw new Error(`INVARIANT_VIOLATION: Matched pair vector lengths do not match totalMatchedPairs (${pairs})`);
  }

  // Check caliper satisfaction on matched pairs
  if (mc.effectiveCaliperWidthRaw !== null && mc.effectiveCaliperWidthRaw !== undefined) {
    const calWidth = mc.effectiveCaliperWidthRaw;
    for (let i = 0; i < pairs; i++) {
      const d = mm.pairDistances[i];
      if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) {
        throw new Error(`INVARIANT_VIOLATION: Invalid pair distance at pair ${i}: ${d}`);
      }
      if (d > calWidth + 1e-7) {
        throw new Error(`INVARIANT_VIOLATION: Pair distance (${d}) exceeds effective caliper width (${calWidth}) for pair ${mu.matchedTreatedIds[i]} - ${mu.matchedControlIds[i]}`);
      }
    }
  }

  // 7. Weights Invariants
  const mw = result.matchingWeights;
  if (!mw || !Array.isArray(mw.unitIds) || !Array.isArray(mw.weights) || !Array.isArray(mw.subclass)) {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing matchingWeights');
  }
  if (mw.unitIds.length !== N || mw.weights.length !== N || mw.subclass.length !== N) {
    throw new Error(`INVARIANT_VIOLATION: Weight vectors length (${mw.weights.length}) != complete cases (${N})`);
  }

  // 8. Sample Accounting Invariants
  const sa = result.sampleAccounting;
  if (!sa || typeof sa.treatedTotal !== 'number' || typeof sa.controlTotal !== 'number') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing sampleAccounting totals');
  }
  if (sa.treatedTotal + sa.controlTotal !== N) {
    throw new Error(`INVARIANT_VIOLATION: treatedTotal (${sa.treatedTotal}) + controlTotal (${sa.controlTotal}) != completeCases (${N})`);
  }
  if (sa.matchedTreatedCount !== pairs) {
    throw new Error(`INVARIANT_VIOLATION: matchedTreatedCount (${sa.matchedTreatedCount}) != totalMatchedPairs (${pairs})`);
  }
  const treatedSum = sa.matchedTreatedCount + sa.unmatchedTreatedCount + sa.discardedTreatedCount;
  if (treatedSum !== sa.treatedTotal) {
    throw new Error(`INVARIANT_VIOLATION: treated matching accounting mismatch (${treatedSum} != ${sa.treatedTotal})`);
  }
  const controlSum = sa.matchedControlCount + sa.unmatchedControlCount + sa.discardedControlCount;
  if (controlSum !== sa.controlTotal) {
    throw new Error(`INVARIANT_VIOLATION: control matching accounting mismatch (${controlSum} != ${sa.controlTotal})`);
  }

  // 9. Numerical Diagnostics & Publication Status
  if (!result.numericalDiagnostics || typeof result.numericalDiagnostics.glmConvergence !== 'boolean') {
    throw new Error('SCHEMA_VALIDATION_ERROR: Missing numericalDiagnostics.glmConvergence');
  }
  if (!result.publicationStatus || !['OUTPUT_READY', 'OUTPUT_GENERATION_RESTRICTED', 'COMPUTATION_FAILED'].includes(result.publicationStatus.verdict)) {
    throw new Error('SCHEMA_VALIDATION_ERROR: Invalid publicationStatus verdict');
  }

  return { valid: true };
}

/**
 * Wraps canonical result into a VersionedCanonicalEnvelope with cryptographic hash
 */
export async function wrapInVersionedEnvelope(resultPayload, metadata = {}) {
  // 1. Enforce runtime schema validation
  validateCanonicalResult(resultPayload);

  // 2. Populate non-self-referential canonicalResultSha256
  const canonicalHash = await computeCanonicalResultHash(resultPayload);
  resultPayload.inputFingerprint.canonicalResultSha256 = canonicalHash;

  // 3. Clone and freeze for defensive consumer boundary
  const cloned = defensiveClone(resultPayload);
  const canonicalJson = serializeCanonical(cloned);
  const envelopeHash = await sha256Hex(canonicalJson);

  const envelope = {
    envelopeVersion: '1.0.0',
    envelopeGeneratedAt: new Date().toISOString(),
    payloadSha256: envelopeHash,
    metadata: {
      ...metadata,
      serializationStandard: 'CP-WEBR-01-CANONICAL-RESULT-CONTRACT',
      canonicalResultSha256: canonicalHash
    },
    payload: deepFreeze(cloned)
  };

  return deepFreeze(envelope);
}

/**
 * Verifies the integrity of a VersionedCanonicalEnvelope
 */
export async function verifyEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return { valid: false, reason: 'Invalid envelope object' };
  }
  if (!envelope.payload || !envelope.payloadSha256) {
    return { valid: false, reason: 'Missing payload or payloadSha256' };
  }
  const canonicalJson = serializeCanonical(envelope.payload);
  const actualHash = await sha256Hex(canonicalJson);

  if (actualHash !== envelope.payloadSha256) {
    return {
      valid: false,
      reason: `Hash mismatch: expected ${envelope.payloadSha256}, got ${actualHash}`
    };
  }

  // Also validate internal CanonicalPsmResult schema
  try {
    validateCanonicalResult(envelope.payload);
  } catch (err) {
    return { valid: false, reason: `Schema invariant error: ${err.message}` };
  }

  return { valid: true, payloadSha256: actualHash };
}
