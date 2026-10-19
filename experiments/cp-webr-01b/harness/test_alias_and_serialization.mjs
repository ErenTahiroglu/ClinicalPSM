// CP-WEBR-01B Alias Mapping and Canonical Serialization Qualification
// Validates:
// 1. Non-self-referential Versioned Canonical Envelope hashing
// 2. Lexicographical key-order normalization
// 3. Floating-point and explicit null handling
// 4. Unicode NFC normalization & tamper detection
// 5. Monotonic sequential alias assignment (^[a-z]+_[0-9]{2,6}$)
// 6. Lossless round-trip mapping & duplicate header rejection

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// -------------------------------------------------------------
// 1. Canonical Serialization & Envelope Implementation
// -------------------------------------------------------------

export function sortKeysRecursively(obj) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') {
      if (!Number.isFinite(obj)) return null;
      return obj;
    }
    if (typeof obj === 'string') {
      return obj.normalize('NFC');
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortKeysRecursively);
  }
  const sorted = {};
  const keys = Object.keys(obj).sort();
  for (const k of keys) {
    sorted[k] = sortKeysRecursively(obj[k]);
  }
  return sorted;
}

export function canonicalSerialize(obj) {
  const normalized = sortKeysRecursively(obj);
  return JSON.stringify(normalized);
}

export function computeSha256(strOrBuffer) {
  return crypto.createHash('sha256').update(strOrBuffer).digest('hex');
}

export function createVersionedEnvelope(datasetSha256, canonicalResult) {
  // Preimage is the canonical JSON string of canonicalResult (which has NO hash)
  const canonicalJson = canonicalSerialize(canonicalResult);
  const canonicalResultSha256 = computeSha256(canonicalJson);

  return {
    schemaVersion: '1.1.0',
    fingerprint: {
      datasetSha256,
      canonicalResultSha256
    },
    result: canonicalResult
  };
}

export function verifyEnvelopeIntegrity(envelope) {
  if (!envelope || !envelope.fingerprint || !envelope.result) {
    return { valid: false, reason: 'MALFORMED_ENVELOPE' };
  }
  const canonicalJson = canonicalSerialize(envelope.result);
  const expectedHash = computeSha256(canonicalJson);
  const match = expectedHash === envelope.fingerprint.canonicalResultSha256;
  return {
    valid: match,
    expectedHash,
    actualHash: envelope.fingerprint.canonicalResultSha256,
    reason: match ? 'OK' : 'HASH_MISMATCH'
  };
}

// -------------------------------------------------------------
// 2. Alias Mapping Implementation
// -------------------------------------------------------------

export const MAX_HEADER_LENGTH = 256;
const ALIAS_REGEX = /^[a-z]+_[0-9]{2,6}$/;

export class IdentifierMapper {
  constructor() {
    this.treatmentAlias = null;
    this.treatmentOriginal = null;
    this.covariateCount = 0;
    this.forwardMap = new Map(); // original -> alias
    this.reverseMap = new Map(); // alias -> metadata
    this.seenNormalized = new Set();
  }

  registerTreatment(originalHeader) {
    if (!originalHeader || typeof originalHeader !== 'string') {
      throw new Error('INVALID_TREATMENT_HEADER: Header must be a non-empty string');
    }
    const nfc = originalHeader.normalize('NFC').trim();
    if (nfc.length === 0) {
      throw new Error('INVALID_TREATMENT_HEADER: Header cannot be empty');
    }
    if (nfc.length > MAX_HEADER_LENGTH) {
      throw new Error(`HEADER_LENGTH_EXCEEDED: Treatment header length (${nfc.length}) exceeds maximum limit of ${MAX_HEADER_LENGTH} characters`);
    }
    if (this.seenNormalized.has(nfc)) {
      throw new Error(`DUPLICATE_HEADER: ${originalHeader}`);
    }
    this.seenNormalized.add(nfc);
    const alias = 'trt_01';
    this.treatmentAlias = alias;
    this.treatmentOriginal = originalHeader;
    this.forwardMap.set(originalHeader, alias);
    this.reverseMap.set(alias, {
      alias,
      role: 'treatment',
      displayName: originalHeader,
      originalHeader,
      index: 0
    });
    return alias;
  }

  registerCovariate(originalHeader) {
    if (!originalHeader || typeof originalHeader !== 'string') {
      throw new Error('INVALID_COVARIATE_HEADER: Header must be a non-empty string');
    }
    const nfc = originalHeader.normalize('NFC').trim();
    if (nfc.length === 0) {
      throw new Error('INVALID_COVARIATE_HEADER: Header cannot be empty');
    }
    if (nfc.length > MAX_HEADER_LENGTH) {
      throw new Error(`HEADER_LENGTH_EXCEEDED: Covariate header length (${nfc.length}) exceeds maximum limit of ${MAX_HEADER_LENGTH} characters`);
    }
    if (this.seenNormalized.has(nfc)) {
      throw new Error(`DUPLICATE_HEADER: ${originalHeader}`);
    }
    this.seenNormalized.add(nfc);
    this.covariateCount++;
    const padIndex = String(this.covariateCount).padStart(2, '0');
    const alias = `cov_${padIndex}`;
    this.forwardMap.set(originalHeader, alias);
    this.reverseMap.set(alias, {
      alias,
      role: 'covariate',
      displayName: originalHeader,
      originalHeader,
      index: this.covariateCount
    });
    return alias;
  }

  getAlias(originalHeader) {
    return this.forwardMap.get(originalHeader) || null;
  }

  getMetadata(alias) {
    return this.reverseMap.get(alias) || null;
  }

  getAllAliases() {
    return Array.from(this.reverseMap.keys());
  }

  validateAllAliases() {
    for (const alias of this.reverseMap.keys()) {
      if (!ALIAS_REGEX.test(alias)) {
        return false;
      }
    }
    return true;
  }
}

// -------------------------------------------------------------
// 3. Test Runner & Suite Execution
// -------------------------------------------------------------

async function runTestSuite() {
  const testResults = {
    executed_at: '2026-10-20T00:00:00.000Z',
    suite: 'CP-WEBR-01B Alias & Canonical Serialization Suite',
    total: 0,
    passed: 0,
    failed: 0,
    results: []
  };

  function assert(name, condition, details = {}) {
    testResults.total++;
    if (condition) {
      testResults.passed++;
      testResults.results.push({ name, status: 'PASS', details });
    } else {
      testResults.failed++;
      testResults.results.push({ name, status: 'FAIL', details });
    }
  }

  // --- Suite 1: Canonical Serialization & Versioned Envelope ---

  // Test 1: Field-order invariance
  const objA = { z: 1, a: 2, m: { y: 10, x: 20 }, arr: [1, 2] };
  const objB = { arr: [1, 2], m: { x: 20, y: 10 }, a: 2, z: 1 };
  const serA = canonicalSerialize(objA);
  const serB = canonicalSerialize(objB);
  assert('Field Order Normalization Invariance', serA === serB, { serA, serB });

  // Test 2: Non-self-referential envelope creation & verification
  const dummyDatasetHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const dummyResult = {
    method: 'nearest',
    distance: 'glm',
    link: 'linear.logit',
    caliper: 0.2,
    sampleSizes: { treated: 50, control: 100, matchedTreated: 50, matchedControl: 50 },
    matchedPairs: [{ treatedId: 'PT_1', controlId: 'PT_9', distance: 0.012 }],
    covariateBalance: {
      cov_01: { meanTreated: 45.2, meanControl: 45.1, smd: 0.008 }
    }
  };
  const envelope = createVersionedEnvelope(dummyDatasetHash, dummyResult);
  const verifyValid = verifyEnvelopeIntegrity(envelope);
  assert('Versioned Envelope Integrity Verification', verifyValid.valid === true, verifyValid);

  // Test 3: Tampering Detection - value modification
  const tamperedValueEnvelope = JSON.parse(JSON.stringify(envelope));
  tamperedValueEnvelope.result.caliper = 0.25;
  const verifyTamperVal = verifyEnvelopeIntegrity(tamperedValueEnvelope);
  assert('Tampering Detection: Value Mutation', verifyTamperVal.valid === false, verifyTamperVal);

  // Test 4: Tampering Detection - key addition
  const tamperedKeyEnvelope = JSON.parse(JSON.stringify(envelope));
  tamperedKeyEnvelope.result.unauthorizedField = 'injected';
  const verifyTamperKey = verifyEnvelopeIntegrity(tamperedKeyEnvelope);
  assert('Tampering Detection: Key Injection', verifyTamperKey.valid === false, verifyTamperKey);

  // Test 5: Explicit Null Preservation
  const nullObj = { a: null, b: 'valid', c: 123 };
  const serNull = canonicalSerialize(nullObj);
  assert('Explicit Null Value Preservation', serNull === '{"a":null,"b":"valid","c":123}', { serNull });

  // Test 6: Non-finite Float Handling (NaN / Infinity -> null)
  const floatObj = { inf: Infinity, negInf: -Infinity, nan: NaN, valid: 1.234 };
  const serFloat = canonicalSerialize(floatObj);
  assert('Non-finite Float Normalization to null', serFloat === '{"inf":null,"nan":null,"negInf":null,"valid":1.234}', { serFloat });

  // Test 7: Unicode NFC Normalization
  // "é" in decomposed form (e + acute accent: \u0065\u0301) vs composed (\u00e9)
  const strNFD = 'Cafe\u0301';
  const strNFC = 'Caf\u00e9';
  const serNFD = canonicalSerialize({ label: strNFD });
  const serNFC = canonicalSerialize({ label: strNFC });
  assert('Unicode NFC Deterministic Matching', serNFD === serNFC, { serNFD, serNFC });

  // --- Suite 2: Monotonic Alias Mapping & Identifier Invariants ---

  const mapper = new IdentifierMapper();

  // Test 8: Treatment registration and regex compliance
  const trtAlias = mapper.registerTreatment('Treatment Group (Drug A vs Standard Care)');
  assert('Treatment Alias Regex Compliance', ALIAS_REGEX.test(trtAlias) && trtAlias === 'trt_01', { trtAlias });

  // Test 9: Covariate sequence generation (monotonic ^[a-z]+_[0-9]{2,6}$)
  const cov1 = mapper.registerCovariate('Age (years)');
  const cov2 = mapper.registerCovariate('Serum Creatinine [mg/dL]');
  const cov3 = mapper.registerCovariate('Biomarker \u0394');
  const cov4 = mapper.registerCovariate('Smoking Status: Current/Former');
  assert('Covariate Sequential Aliases', cov1 === 'cov_01' && cov2 === 'cov_02' && cov3 === 'cov_03' && cov4 === 'cov_04', {
    aliases: [cov1, cov2, cov3, cov4]
  });

  // Test 10: All registered aliases satisfy regex
  assert('All Aliases Strictly Satisfy ^[a-z]+_[0-9]{2,6}$', mapper.validateAllAliases(), {
    all: mapper.getAllAliases()
  });

  // Test 11: Lossless Round-Trip Metadata Preservation
  const meta2 = mapper.getMetadata('cov_02');
  assert('Lossless Original Header & Display Name Round-Trip',
    meta2.originalHeader === 'Serum Creatinine [mg/dL]' && meta2.displayName === 'Serum Creatinine [mg/dL]',
    meta2
  );

  const meta3 = mapper.getMetadata('cov_03');
  assert('Lossless Unicode Header Round-Trip',
    meta3.originalHeader === 'Biomarker \u0394' && meta3.displayName === 'Biomarker \u0394',
    meta3
  );

  // Test 12: Duplicate Header Detection & Rejection
  let duplicateRejected = false;
  try {
    mapper.registerCovariate('Age (years)'); // Duplicate of cov_01
  } catch (err) {
    if (err.message.startsWith('DUPLICATE_HEADER')) {
      duplicateRejected = true;
    }
  }
  assert('Duplicate Header Rejection', duplicateRejected === true);

  // Test 13: Confusable NFC Header Rejection
  let confusableRejected = false;
  try {
    mapper.registerCovariate('Cafe\u0301');
    mapper.registerCovariate('Caf\u00e9'); // Decomposed vs composed duplicate
  } catch (err) {
    if (err.message.startsWith('DUPLICATE_HEADER')) {
      confusableRejected = true;
    }
  }
  assert('Unicode Confusable / Normalization Equivalent Rejection', confusableRejected === true);

  // Test 14: Collision Safety under high count (100 sequential covariates)
  const largeMapper = new IdentifierMapper();
  largeMapper.registerTreatment('TRT');
  let validAllLarge = true;
  for (let i = 1; i <= 100; i++) {
    const a = largeMapper.registerCovariate(`Clinical Variable ${i}`);
    if (!ALIAS_REGEX.test(a)) validAllLarge = false;
  }
  assert('Large-Scale Covariate Sequential Mapping Regex Compliance', validAllLarge, {
    count: 100,
    sampleLast: largeMapper.getAlias('Clinical Variable 100')
  });

  // Test 15: Header Length Boundary - Exact 256 code points allowed
  const lenMapper = new IdentifierMapper();
  lenMapper.registerTreatment('TRT');
  const exact256 = 'A'.repeat(256);
  const alias256 = lenMapper.registerCovariate(exact256);
  assert('Header Length Policy: Exact 256 Code Points Accepted', alias256 === 'cov_01');

  // Test 16: Header Length Boundary - 257 code points rejected with descriptive diagnostic
  let lenOverRejected = false;
  let lenErrorMsg = '';
  try {
    lenMapper.registerCovariate('B'.repeat(257));
  } catch (err) {
    if (err.message.startsWith('HEADER_LENGTH_EXCEEDED')) {
      lenOverRejected = true;
      lenErrorMsg = err.message;
    }
  }
  assert('Header Length Policy: 257 Code Points Rejected', lenOverRejected === true, { error: lenErrorMsg });

  // Test 17: Empty Header Rejection
  let emptyRejected = false;
  try {
    lenMapper.registerCovariate('   ');
  } catch (err) {
    if (err.message.startsWith('INVALID_COVARIATE_HEADER')) {
      emptyRejected = true;
    }
  }
  assert('Empty/Whitespace Header Rejection', emptyRejected === true);

  // Output results
  const outPath = path.resolve('experiments/cp-webr-01b/ALIAS-AND-SERIALIZATION-TESTS.json');
  fs.writeFileSync(outPath, JSON.stringify(testResults, null, 2), 'utf-8');
  console.log(`Wrote test results to ${outPath}`);
  console.log(`Passed: ${testResults.passed}/${testResults.total}, Failed: ${testResults.failed}`);

  if (testResults.failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
