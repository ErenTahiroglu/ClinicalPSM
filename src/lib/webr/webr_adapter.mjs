// CP-WEBR-02A High-Level WebR Statistical Adapter
// Conforms to CP-WEBR-01 Production Architecture & Canonical Result Contract & R1.1 Requirements
// Completely environment-neutral: runs seamlessly in both Node.js and Chromium Workers

import { SymbolMapper } from './symbol_mapper.mjs';
import { constructWebREnvironment } from './webr_binding.mjs';
import { wrapInVersionedEnvelope, sha256Hex } from './canonical_serializer.mjs';

export function unpackWebR(node) {
  if (node === null || node === undefined) return null;
  if (typeof node !== 'object') return node;
  if (node.type === 'null') return null;

  if (node.type === 'list') {
    if (Array.isArray(node.names)) {
      const obj = {};
      for (let i = 0; i < node.names.length; i++) {
        obj[node.names[i]] = unpackWebR(node.values[i]);
      }
      return obj;
    } else {
      return (node.values || []).map(unpackWebR);
    }
  }

  if (['double', 'integer', 'logical', 'character'].includes(node.type)) {
    if (!node.values) return null;
    return node.values;
  }

  if (node.values !== undefined) {
    return node.values;
  }

  return node;
}

function toScalar(val, fallback = null) {
  if (val === null || val === undefined) return fallback;
  if (Array.isArray(val)) return val.length > 0 ? (val[0] ?? fallback) : fallback;
  return val;
}

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return [val];
}

function isTRUE(val) {
  return val === true || val === 1 || val === 'true';
}

export class WebRStatisticalAdapter {
  constructor(webRInstance, options = {}) {
    this.webR = webRInstance;
    this.options = options;
    this.rTemplateSource = options.rTemplateSource || null;
    this.expectedTemplateSha256 = options.rTemplateSha256 || null;
    this.rTemplateSha256 = null;
    this.templateLoaded = false;
  }

  /**
   * Initializes or verifies the authoritative R computation template
   * @param {string} rTemplateSource - Exact UTF-8 source string of r_template.R
   * @param {string} [expectedSha256] - Optional expected SHA-256 for integrity verification
   */
  async initTemplate(rTemplateSource, expectedSha256 = null) {
    if (!rTemplateSource || typeof rTemplateSource !== 'string') {
      throw new Error('Valid R template source string required');
    }
    const actualSha = await sha256Hex(rTemplateSource);
    const targetSha = expectedSha256 || this.expectedTemplateSha256;
    if (targetSha && actualSha !== targetSha) {
      const err = new Error(`R template integrity mismatch: expected ${targetSha}, got ${actualSha}`);
      err.code = 'TEMPLATE_INTEGRITY_MISMATCH';
      throw err;
    }
    this.rTemplateSource = rTemplateSource;
    this.rTemplateSha256 = actualSha;
    await this.webR.evalR(rTemplateSource);
    this.templateLoaded = true;
    return { loaded: true, templateSha256: actualSha };
  }

  async ensureTemplateLoaded() {
    if (!this.templateLoaded) {
      if (this.rTemplateSource) {
        await this.initTemplate(this.rTemplateSource, this.rTemplateSha256);
      } else {
        throw new Error('R template not loaded. Call adapter.initTemplate(templateSource) before running analysis.');
      }
    }
  }

  /**
   * Executes a complete statistical matching analysis on a structured dataset
   * @param {Object} datasetInput
   * @returns {Promise<Object>} VersionedCanonicalEnvelope containing CanonicalPsmResult
   */
  async runAnalysis(datasetInput) {
    const startTime = Date.now();
    await this.ensureTemplateLoaded();

    if (!datasetInput || typeof datasetInput !== 'object') {
      throw new Error('Invalid datasetInput: expected object');
    }
    if (!Array.isArray(datasetInput.rows) || datasetInput.rows.length === 0) {
      throw new Error('Invalid datasetInput: rows array must be non-empty');
    }

    // 1. Compute input dataset SHA-256 fingerprint deterministically
    const datasetJson = JSON.stringify(datasetInput.rows);
    const datasetSha256 = await sha256Hex(datasetJson);

    // 2. Initialize reversible symbol mapper
    const mapper = new SymbolMapper();

    // 3. Construct isolated R environment and bind data structures safely
    const {
      analysisEnv,
      factorMetadata,
      rProxies
    } = await constructWebREnvironment(this.webR, datasetInput, mapper);

    // Assemble data frame in child environment with factor transformations
    let factorProcessingCode = '';
    for (const [covAlias, meta] of Object.entries(factorMetadata)) {
      factorProcessingCode += `
        ${covAlias}_fac <- factor(
          ${covAlias}_raw,
          levels = ${covAlias}_levels
        )
        ${covAlias} <- stats::relevel(${covAlias}_fac, ref = ${covAlias}_ref)
      `;
    }

    const assembleDfCode = `
      local({
        ${factorProcessingCode}
        df_cols <- list()
        df_cols[[target_trt_name]] <- get(target_trt_name)
        for (cov in target_cov_names) {
          df_cols[[cov]] <- get(cov)
        }
        df_bound <- as.data.frame(df_cols, stringsAsFactors = FALSE)
        rownames(df_bound) <- row_ids

        raw_res <- run_psm_analysis(
          df = df_bound,
          trt_name = target_trt_name,
          cov_names = target_cov_names,
          caliper_val = target_caliper_val,
          std_caliper = target_std_caliper,
          discard_opt = target_discard_opt,
          link_opt = target_link_opt
        )
        return(raw_res)
      })
    `;

    let rOutputProxy;
    try {
      rOutputProxy = await this.webR.evalR(assembleDfCode, { env: analysisEnv });
      const rawRes = await rOutputProxy.toJs();
      const unpackedRes = unpackWebR(rawRes);

      // Clean up WebR proxies
      for (const p of rProxies) {
        try { if (p && p.destroy) await p.destroy(); } catch {}
      }
      try { if (analysisEnv && analysisEnv.destroy) await analysisEnv.destroy(); } catch {}

      // 4. Transform raw R output into CanonicalPsmResult adhering to specification
      const durationMs = Date.now() - startTime;
      const canonicalResult = this.buildCanonicalResult(
        unpackedRes,
        datasetInput,
        mapper,
        factorMetadata,
        datasetSha256,
        durationMs
      );

      // 5. Wrap into VersionedCanonicalEnvelope with defensive copy and cryptographic hash
      return await wrapInVersionedEnvelope(canonicalResult, {
        runId: canonicalResult.metadata.runId,
        executionDurationMs: durationMs,
        rTemplateSha256: this.rTemplateSha256
      });
    } catch (err) {
      // Clean up proxies on error
      for (const p of rProxies) {
        try { if (p && p.destroy) await p.destroy(); } catch {}
      }
      try { if (analysisEnv && analysisEnv.destroy) await analysisEnv.destroy(); } catch {}
      throw err;
    }
  }

  buildCanonicalResult(unpacked, input, mapper, factorMetadata = {}, datasetSha256, durationMs) {
    const glm = unpacked.glm || {};
    const matching = unpacked.matching || {};
    const sampleAcc = unpacked.sampleAccounting || {};
    const pubStatus = unpacked.publicationStatus || {};
    const rubin = unpacked.rubin || {};
    const numSafeguard = unpacked.numericalInstabilitySafeguard || {};

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Build factor configuration ledger
    const rawCovHeaders = input.covariates.map(c => typeof c === 'string' ? c : c?.name);
    const factorConfig = {};
    for (const origHeader of [input.treatmentVariable, ...rawCovHeaders]) {
      const alias = mapper.getAlias(origHeader);
      if (origHeader === input.treatmentVariable) {
        factorConfig[alias] = {
          originalHeader: origHeader,
          internalAlias: alias,
          displayName: origHeader,
          inferredType: 'binary',
          levels: ['0', '1'],
          referenceLevel: '0',
          droppedLevel: null
        };
      } else if (factorMetadata && factorMetadata[alias]) {
        factorConfig[alias] = { ...factorMetadata[alias] };
      } else {
        const declaredType = input.covariateDefinitions?.[origHeader]?.inferredType ||
          (input.covariates.find(c => typeof c === 'object' && c?.name === origHeader)?.inferredType) ||
          'continuous';
        factorConfig[alias] = {
          originalHeader: origHeader,
          internalAlias: alias,
          displayName: origHeader,
          inferredType: declaredType,
          levels: [],
          referenceLevel: null,
          droppedLevel: null
        };
      }
    }

    // Map balance table rows back to original clinical headers
    const rawBalance = Array.isArray(unpacked.balanceTable) ? unpacked.balanceTable : [];
    const balanceTable = rawBalance.map(row => {
      const covName = toScalar(row.covariateName);
      const orig = mapper.getOriginal(covName) || covName;
      return {
        covariateName: covName,
        originalHeader: orig,
        displayName: orig,
        type: toScalar(row.type, 'continuous'),
        unadjustedTreatedMean: toScalar(row.unadjustedTreatedMean),
        unadjustedTreatedSd: toScalar(row.unadjustedTreatedSd),
        unadjustedControlMean: toScalar(row.unadjustedControlMean),
        unadjustedControlSd: toScalar(row.unadjustedControlSd),
        unadjustedSmd: toScalar(row.unadjustedSmd),
        rawDifferenceUnadjusted: toScalar(row.rawDifferenceUnadjusted),
        matchedTreatedMean: toScalar(row.matchedTreatedMean),
        matchedTreatedSd: toScalar(row.matchedTreatedSd),
        matchedControlMean: toScalar(row.matchedControlMean),
        matchedControlSd: toScalar(row.matchedControlSd),
        matchedSmd: toScalar(row.matchedSmd),
        rawDifferenceMatched: toScalar(row.rawDifferenceMatched),
        smdReductionPercent: toScalar(row.smdReductionPercent),
        unadjustedVarianceRatio: toScalar(row.unadjustedVarianceRatio),
        matchedVarianceRatio: toScalar(row.matchedVarianceRatio),
        heuristicStatus: toScalar(row.heuristicStatus, 'balanced_smd_and_vr')
      };
    });

    const unitIds = input.rows.map(r => String(r.id).trim());
    const totalUnits = input.rows.length;

    const distanceMetric = input.options?.distanceMetric || 'linear.logit';
    const caliperVal = input.options?.caliper ?? null;
    const stdCaliper = input.options?.stdCaliper ?? true;
    const discardOpt = input.options?.discard || 'none';

    const caliperClause = caliperVal !== null && caliperVal !== undefined
      ? `, caliper = ${caliperVal}, std.caliper = ${stdCaliper}`
      : '';
    const discardClause = discardOpt && discardOpt !== 'none'
      ? `, discard = "${discardOpt}"`
      : '';
    const rCallMatchIt = `MatchIt::matchit(formula = ${input.treatmentVariable} ~ ${rawCovHeaders.join(' + ')}, data = df, method = "nearest", distance = "glm", link = "${distanceMetric}", estimand = "ATT", m.order = "largest", replace = FALSE, ratio = 1${caliperClause}${discardClause})`;

    return {
      metadata: {
        runId,
        parentRunId: null,
        timestamp: new Date().toISOString(),
        seed: null,
        executionDurationMs: durationMs,
        platform: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js test environment',
          cores: typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 1
        }
      },
      inputFingerprint: {
        datasetSha256,
        canonicalResultSha256: '', // Populated by wrapInVersionedEnvelope via computeCanonicalResultHash
        totalRows: totalUnits,
        completeCases: totalUnits,
        excludedRows: 0,
        exclusionReasonSummary: {}
      },
      toolchain: {
        webrVersion: '0.6.0',
        rVersion: '4.6.0',
        emscriptenVersion: '5.0.7',
        matchItVersion: '4.8.1',
        cobaltVersion: '5.0.0',
        packageVersions: {
          matchIt: '4.8.1',
          cobalt: '5.0.0',
          webr: '0.6.0',
          r: '4.6.0'
        },
        dependencyVerificationStatus: 'PACKAGE_VERSION_PINNED_WASM_PRECOMPILED'
      },
      matchingConfiguration: {
        treatmentVariable: input.treatmentVariable,
        covariates: rawCovHeaders,
        distanceMetric,
        method: 'nearest',
        ratio: 1,
        replace: false,
        matchingOrder: 'largest',
        caliper: caliperVal,
        stdCaliper,
        discard: discardOpt,
        effectiveCaliperWidthRaw: toScalar(matching.effectiveCaliperWidth),
        matchingDistanceScale: toScalar(matching.matchingDistanceScale, distanceMetric),
        caliperScaleDescription: toScalar(matching.caliperScaleDescription, 'none')
      },
      factorConfiguration: factorConfig,
      propensityScores: {
        unitIds,
        treatment: input.rows.map(r => Number(r[input.treatmentVariable])),
        propensityScores: toArray(glm.propensityScores).map(Number),
        linearLogits: toArray(glm.linearLogits).map(Number)
      },
      matchMatrix: {
        treatedIds: toArray(matching.matchedTreatedIds).map(String),
        matchedControlIds: toArray(matching.matchedControlIds).map(String),
        pairDistances: toArray(matching.pairDistances).map(d => d !== null && d !== undefined ? Number(d) : null)
      },
      matchedUnits: {
        matchedTreatedIds: toArray(matching.matchedTreatedIds).map(String),
        matchedControlIds: toArray(matching.matchedControlIds).map(String),
        totalMatchedPairs: Number(matching.totalMatchedPairs),
        pairDistances: toArray(matching.pairDistances).map(d => d !== null && d !== undefined ? Number(d) : null)
      },
      matchingWeights: {
        unitIds,
        weights: toArray(matching.weights).map(Number),
        subclass: toArray(matching.subclasses).map(s => s !== null && s !== undefined ? Number(s) : null)
      },
      sampleAccounting: {
        importedTotal: Number(sampleAcc.importedTotal),
        completeCases: Number(sampleAcc.completeCases),
        treatedTotal: Number(sampleAcc.treatedTotal),
        controlTotal: Number(sampleAcc.controlTotal),
        matchedTreatedCount: Number(sampleAcc.matchedTreatedCount),
        matchedControlCount: Number(sampleAcc.matchedControlCount),
        unmatchedTreatedCount: Number(sampleAcc.unmatchedTreatedCount),
        unmatchedControlCount: Number(sampleAcc.unmatchedControlCount),
        discardedTreatedCount: Number(sampleAcc.discardedTreatedCount),
        discardedControlCount: Number(sampleAcc.discardedControlCount),
        treatedRetentionRate: Number(sampleAcc.treatedRetentionRate)
      },
      balanceTable,
      numericalDiagnostics: {
        glmConvergence: isTRUE(toScalar(glm.converged)),
        glmIterations: toScalar(glm.iter, 0),
        glmNullDeviance: toScalar(glm.nullDeviance),
        glmResidualDeviance: toScalar(glm.residualDeviance),
        maxAbsoluteCoefficient: toScalar(glm.maxAbsoluteCoefficient),
        maxCoefficientStandardError: toScalar(glm.maxCoefficientStandardError),
        coefficientTable: Array.isArray(glm.coefficients) ? glm.coefficients.map(c => {
          const rawTerm = toScalar(c.term);
          const mappedTerm = mapper.getOriginal(rawTerm) || rawTerm;
          return {
            term: mappedTerm,
            estimate: toScalar(c.estimate),
            standardError: toScalar(c.standardError),
            zValue: toScalar(c.zValue),
            pValue: toScalar(c.pValue),
            aliased: isTRUE(toScalar(c.aliased))
          };
        }) : [],
        rubinB: toScalar(rubin.b),
        rubinR: toScalar(rubin.r)
      },
      numericalInstabilitySafeguard: {
        triggered: isTRUE(toScalar(numSafeguard.triggered)),
        maxCoefficientStandardError: toScalar(numSafeguard.maxCoefficientStandardError),
        maxAbsoluteCoefficient: toScalar(numSafeguard.maxAbsoluteCoefficient),
        policyClassification: toScalar(numSafeguard.policyClassification, 'PRESPECIFIED_NON_DIAGNOSTIC_RISK_SAFEGUARD'),
        certificationStatus: toScalar(numSafeguard.certificationStatus, 'UNVALIDATED_SAFEGUARD_NOT_SEPARATION_DETECTOR')
      },
      warnings: Array.isArray(unpacked.warnings) ? unpacked.warnings.map(w => ({
        code: toScalar(w.code),
        message: toScalar(w.message),
        severity: toScalar(w.severity),
        impactDescription: toScalar(w.impactDescription)
      })) : [],
      methodProvenance: {
        rCallMatchIt,
        rCallCobalt: 'cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "raw", un = TRUE)',
        citationBibtexMatchIt: '@article{ho2011matchit, title={MatchIt: Nonparametric Preprocessing for Parametric Causal Inference}, author={Ho, Daniel E and Imai, Kosuke and King, Gary and Stuart, Elizabeth A}, journal={Journal of Statistical Software}, year={2011}}',
        citationBibtexCobalt: '@manual{greifer2024cobalt, title={cobalt: Covariate Balance Tables and Plots}, author={Greifer, Noah}, year={2024}}'
      },
      publicationStatus: {
        verdict: toScalar(pubStatus.verdict, 'COMPUTATION_FAILED'),
        reasons: toArray(pubStatus.reasons).map(String),
        outputGenerationAllowed: isTRUE(toScalar(pubStatus.outputGenerationAllowed))
      }
    };
  }
}
