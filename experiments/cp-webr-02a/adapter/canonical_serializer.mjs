// CP-WEBR-02A Canonical Serializer & Defensive Copy Boundary
// Conforms to CP-WEBR-01 Canonical Result Contract Section 4 & Production Architecture Section 4.4

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
    // Return normal number; JSON.stringify handles standard representations
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
 * Serializes canonical result into a deterministic JSON string
 */
export function serializeCanonical(obj) {
  const canonical = canonicalizeValue(obj);
  return JSON.stringify(canonical);
}

/**
 * Wraps canonical result into a VersionedCanonicalEnvelope with cryptographic hash
 */
export async function wrapInVersionedEnvelope(resultPayload, metadata = {}) {
  const cloned = defensiveClone(resultPayload);
  const canonicalJson = serializeCanonical(cloned);
  const sha256 = await sha256Hex(canonicalJson);

  return {
    envelopeVersion: '1.0.0',
    envelopeGeneratedAt: new Date().toISOString(),
    payloadSha256: sha256,
    metadata: {
      ...metadata,
      serializationStandard: 'CP-WEBR-01-CANONICAL-RESULT-CONTRACT'
    },
    payload: cloned
  };
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
  return { valid: true, payloadSha256: actualHash };
}
