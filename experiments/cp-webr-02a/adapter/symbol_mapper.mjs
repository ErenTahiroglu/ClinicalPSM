// CP-WEBR-02A Reversible Symbol Mapper
// Conforms to CP-WEBR-01 Production Architecture Section 4.2 & Errata H

export class SymbolMapper {
  constructor() {
    this.headerToAlias = new Map();
    this.aliasToHeader = new Map();
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
      throw new Error(`Header contains prohibited control or null characters: "${header}"`);
    }

    // Unicode NFC normalization
    const normalized = header.normalize('NFC').trim();

    // Check length (1 to 256 Unicode code points)
    const codePointCount = [...normalized].length;
    if (codePointCount < 1) {
      throw new Error('Header must contain at least 1 non-whitespace character');
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
    const clean = SymbolMapper.validateAndNormalizeHeader(originalHeader);
    if (this.headerToAlias.has(clean)) {
      return this.headerToAlias.get(clean);
    }
    const numStr = String(this.treatmentCounter++).padStart(2, '0');
    const alias = `trt_${numStr}`;
    this.headerToAlias.set(clean, alias);
    this.aliasToHeader.set(alias, clean);
    return alias;
  }

  /**
   * Registers a covariate header and returns its monotonic safe internal alias (e.g. "cov_00")
   */
  registerCovariate(originalHeader) {
    const clean = SymbolMapper.validateAndNormalizeHeader(originalHeader);
    if (this.headerToAlias.has(clean)) {
      return this.headerToAlias.get(clean);
    }
    const numStr = String(this.covariateCounter++).padStart(2, '0');
    const alias = `cov_${numStr}`;
    this.headerToAlias.set(clean, alias);
    this.aliasToHeader.set(alias, clean);
    return alias;
  }

  /**
   * Translates original header to safe internal alias
   */
  getAlias(originalHeader) {
    const clean = originalHeader.normalize('NFC').trim();
    return this.headerToAlias.get(clean) || null;
  }

  /**
   * Translates safe internal alias back to original clinical header
   */
  getOriginal(alias) {
    return this.aliasToHeader.get(alias) || null;
  }

  /**
   * Returns complete mapping tables
   */
  getMappingLedger() {
    return {
      headerToAlias: Object.fromEntries(this.headerToAlias),
      aliasToHeader: Object.fromEntries(this.aliasToHeader)
    };
  }
}
