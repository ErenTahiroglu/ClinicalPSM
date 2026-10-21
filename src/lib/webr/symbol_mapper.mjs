// CP-WEBR-02A Reversible Symbol Mapper
// Conforms to CP-WEBR-01 Production Architecture Section 4.2 & Errata H & R1.1 Requirements

export class SymbolMapper {
  constructor() {
    this.rawHeaderToAlias = new Map();
    this.aliasToRawHeader = new Map();
    this.normalizedKeyToRaw = new Map();
    this.treatmentHeader = null;
    this.covariateHeaders = new Set();
    this.covariateCounter = 0;
    this.treatmentCounter = 0;
  }

  /**
   * Normalizes and validates raw header string according to Section 4.2 Tier 1
   */
  static validateAndNormalizeHeader(header) {
    if (typeof header !== 'string') {
      throw new Error(`Invalid header type: expected string, got ${typeof header}`);
    }

    // Check null bytes or control characters
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(header)) {
      const err = new Error(`Header contains prohibited control or null characters: "${header}"`);
      err.code = 'INVALID_HEADER_CHARACTERS';
      throw err;
    }

    // Unicode NFC normalization
    const normalized = header.normalize('NFC').trim();

    // Check length (1 to 256 Unicode code points)
    const codePointCount = [...normalized].length;
    if (codePointCount < 1) {
      const err = new Error('Header must contain at least 1 non-whitespace character');
      err.code = 'HEADER_EMPTY';
      throw err;
    }
    if (codePointCount > 256) {
      const err = new Error(`Header length exceeds maximum 256 Unicode code points: "${normalized}" (${codePointCount} code points)`);
      err.code = 'HEADER_LENGTH_EXCEEDED';
      throw err;
    }

    return normalized;
  }

  /**
   * Registers a treatment variable and returns its monotonic safe internal alias (e.g. "trt_00")
   */
  registerTreatment(originalHeader) {
    const normalized = SymbolMapper.validateAndNormalizeHeader(originalHeader);

    if (this.normalizedKeyToRaw.has(normalized)) {
      const existing = this.normalizedKeyToRaw.get(normalized);
      if (existing !== originalHeader) {
        const err = new Error(`HEADER_NORMALIZATION_COLLISION: Normalization collision between "${originalHeader}" and "${existing}"`);
        err.code = 'HEADER_NORMALIZATION_COLLISION';
        throw err;
      }
      if (this.covariateHeaders.has(existing)) {
        const err = new Error(`TREATMENT_AS_COVARIATE_REJECTED: Variable "${originalHeader}" cannot be both treatment and covariate`);
        err.code = 'TREATMENT_AS_COVARIATE_REJECTED';
        throw err;
      }
      return this.rawHeaderToAlias.get(existing);
    }

    if (this.treatmentHeader !== null) {
      const err = new Error(`MULTIPLE_TREATMENTS_REJECTED: Treatment already registered as "${this.treatmentHeader}"`);
      err.code = 'MULTIPLE_TREATMENTS_REJECTED';
      throw err;
    }

    const numStr = String(this.treatmentCounter++).padStart(2, '0');
    const alias = `trt_${numStr}`;
    this.normalizedKeyToRaw.set(normalized, originalHeader);
    this.rawHeaderToAlias.set(originalHeader, alias);
    this.aliasToRawHeader.set(alias, originalHeader);
    this.treatmentHeader = originalHeader;
    return alias;
  }

  /**
   * Registers a covariate header and returns its monotonic safe internal alias (e.g. "cov_00")
   */
  registerCovariate(originalHeader) {
    const normalized = SymbolMapper.validateAndNormalizeHeader(originalHeader);

    if (this.normalizedKeyToRaw.has(normalized)) {
      const existing = this.normalizedKeyToRaw.get(normalized);
      if (existing !== originalHeader) {
        const err = new Error(`HEADER_NORMALIZATION_COLLISION: Normalization collision between "${originalHeader}" and "${existing}"`);
        err.code = 'HEADER_NORMALIZATION_COLLISION';
        throw err;
      }
      if (this.treatmentHeader === existing) {
        const err = new Error(`TREATMENT_AS_COVARIATE_REJECTED: Variable "${originalHeader}" cannot be both treatment and covariate`);
        err.code = 'TREATMENT_AS_COVARIATE_REJECTED';
        throw err;
      }
      if (this.covariateHeaders.has(existing)) {
        const err = new Error(`REPEATED_COVARIATE_REJECTED: Duplicate covariate registration: "${originalHeader}"`);
        err.code = 'REPEATED_COVARIATE_REJECTED';
        throw err;
      }
    }

    const numStr = String(this.covariateCounter++).padStart(2, '0');
    const alias = `cov_${numStr}`;
    this.normalizedKeyToRaw.set(normalized, originalHeader);
    this.rawHeaderToAlias.set(originalHeader, alias);
    this.aliasToRawHeader.set(alias, originalHeader);
    this.covariateHeaders.add(originalHeader);
    return alias;
  }

  /**
   * Translates original header to safe internal alias
   */
  getAlias(originalHeader) {
    const headerStr = typeof originalHeader === 'string' ? originalHeader : (originalHeader && typeof originalHeader === 'object' ? originalHeader.name : null);
    if (!headerStr || typeof headerStr !== 'string') return null;
    if (this.rawHeaderToAlias.has(headerStr)) {
      return this.rawHeaderToAlias.get(headerStr);
    }
    const clean = headerStr.normalize('NFC').trim();
    if (this.normalizedKeyToRaw.has(clean)) {
      const raw = this.normalizedKeyToRaw.get(clean);
      return this.rawHeaderToAlias.get(raw) || null;
    }
    return null;
  }

  /**
   * Translates safe internal alias back to exact original clinical header (preserving whitespace/case)
   */
  getOriginal(alias) {
    if (this.aliasToRawHeader.has(alias)) {
      return this.aliasToRawHeader.get(alias);
    }
    // Handle dummy-expanded factor levels like "cov_02_M" -> "sex_M"
    for (const [baseAlias, rawHeader] of this.aliasToRawHeader.entries()) {
      if (alias.startsWith(baseAlias + '_')) {
        const level = alias.slice(baseAlias.length + 1);
        return `${rawHeader}_${level}`;
      }
    }
    return null;
  }

  /**
   * Returns complete mapping tables
   */
  getMappingLedger() {
    return {
      headerToAlias: Object.fromEntries(this.rawHeaderToAlias),
      aliasToHeader: Object.fromEntries(this.aliasToRawHeader)
    };
  }
}
