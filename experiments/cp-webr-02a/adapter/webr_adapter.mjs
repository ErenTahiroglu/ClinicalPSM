// CP-WEBR-02A High-Level WebR Statistical Adapter
// Conforms to CP-WEBR-01 Production Architecture & Canonical Result Contract

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { SymbolMapper } from './symbol_mapper.mjs';
import { constructWebREnvironment } from './webr_binding.mjs';
import { defensiveClone, wrapInVersionedEnvelope } from './canonical_serializer.mjs';

const rTemplateSource = fs.readFileSync(
  path.resolve('experiments/cp-webr-02a/adapter/r_template.R'),
  'utf-8'
);

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
    this.templateLoaded = false;
  }

  async ensureTemplateLoaded() {
    if (!this.templateLoaded) {
      await this.webR.evalR(rTemplateSource);
      this.templateLoaded = true;
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

    if (!datasetInput.treatmentVariable) {
      throw new Error('Treatment variable must be specified');
    }
    if (!datasetInput.covariates || datasetInput.covariates.length === 0) {
      throw new Error('At least one covariate must be specified');
    }
    if (!datasetInput.rows || datasetInput.rows.length === 0) {
      throw new Error('Dataset contains zero rows');
    }

    // 1. Build bidirectional symbol mapper
    const mapper = new SymbolMapper();
    const trtAlias = mapper.registerTreatment(datasetInput.treatmentVariable);
    const covAliases = [];
    for (const cov of datasetInput.covariates) {
      covAliases.push(mapper.registerCovariate(cov));
    }

    // Compute input dataset hash
    const datasetJson = JSON.stringify(datasetInput.rows);
    const datasetSha256 = crypto.createHash('sha256').update(datasetJson).digest('hex');

    // 2. Safe WebR Parameter Binding
    const { analysisEnv, rProxies } = await constructWebREnvironment(
      this.webR,
      datasetInput,
      mapper
    );

    const assembleDfCode = `
      df_bound <- data.frame(row.names = row_ids)
      df_bound[[target_trt_name]] <- as.integer(get(target_trt_name))
      for (ca in target_cov_names) {
        if (exists(paste0(ca, "_raw"), inherits = FALSE)) {
          df_bound[[ca]] <- factor(get(paste0(ca, "_raw")))
        } else {
          df_bound[[ca]] <- as.numeric(get(ca))
        }
      }
      # Invoke pure analysis function
      raw_res <- run_psm_analysis(
        df = df_bound,
        trt_name = target_trt_name,
        cov_names = target_cov_names,
        caliper_val = target_caliper_val,
        std_caliper = target_std_caliper
      )
    `;

    let rOutputProxy;
    try {
      await this.webR.evalR(assembleDfCode, { env: analysisEnv });
      rOutputProxy = await this.webR.evalR('raw_res', { env: analysisEnv });
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
        datasetSha256,
        durationMs
      );

      // 5. Wrap into VersionedCanonicalEnvelope with defensive copy
      return wrapInVersionedEnvelope(canonicalResult, {
        runId: canonicalResult.metadata.runId,
        executionDurationMs: durationMs
      });
    } catch (err) {
      // Clean up proxies on error
      for (const p of rProxies) {
        try { if (p && p.destroy) await p.destroy(); } catch {}
      }
      throw err;
    }
  }

  buildCanonicalResult(unpacked, input, mapper, datasetSha256, durationMs) {
    const glm = unpacked.glm || {};
    const matching = unpacked.matching || {};
    const sampleAcc = unpacked.sampleAccounting || {};
    const pubStatus = unpacked.publicationStatus || {};
    const rubin = unpacked.rubin || {};

    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Build factor configuration ledger
    const factorConfig = {};
    for (const origHeader of [input.treatmentVariable, ...input.covariates]) {
      const alias = mapper.getAlias(origHeader);
      factorConfig[alias] = {
        originalHeader: origHeader,
        internalAlias: alias,
        displayName: origHeader,
        inferredType: origHeader === input.treatmentVariable ? 'binary' : 'continuous',
        levels: origHeader === input.treatmentVariable ? ['0', '1'] : [],
        referenceLevel: origHeader === input.treatmentVariable ? '0' : null,
        droppedLevel: null
      };
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

    const unitIds = input.rows.map((r, idx) => r.id !== undefined && r.id !== null ? String(r.id) : String(idx + 1));

    return {
      metadata: {
        runId,
        parentRunId: null,
        timestamp: new Date().toISOString(),
        seed: null,
        executionDurationMs: durationMs,
        platform: {
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js test environment',
          cores: 1
        }
      },
      inputFingerprint: {
        datasetSha256,
        canonicalResultSha256: '', // Will be calculated by envelope wrapper
        totalRows: input.rows.length,
        completeCases: input.rows.length,
        excludedRows: 0,
        exclusionReasonSummary: {}
      },
      toolchain: {
        webrVersion: '0.6.0',
        rVersion: '4.6.0',
        emscriptenVersion: '5.0.7',
        matchItVersion: '4.8.1',
        cobaltVersion: '5.0.0',
        dependencySha256s: {}
      },
      matchingConfiguration: {
        treatmentVariable: input.treatmentVariable,
        covariates: input.covariates,
        distanceMetric: input.options?.distanceMetric || 'linear.logit',
        method: 'nearest',
        ratio: 1,
        replace: false,
        matchingOrder: 'largest',
        caliper: input.options?.caliper ?? null,
        stdCaliper: input.options?.stdCaliper ?? true,
        effectiveCaliperWidthRaw: null,
        caliperScaleDescription: input.options?.caliper ? 'pooled standard deviation of linear logit' : 'none'
      },
      factorConfiguration: factorConfig,
      propensityScores: {
        unitIds,
        treatment: input.rows.map(r => Number(r[input.treatmentVariable])),
        propensityScores: toArray(glm.propensityScores),
        linearLogits: toArray(glm.linearLogits)
      },
      matchMatrix: {
        treatedIds: toArray(matching.matchedTreatedIds),
        matchedControlIds: toArray(matching.matchedControlIds),
        pairDistances: toArray(matching.pairDistances)
      },
      matchedUnits: {
        matchedTreatedIds: toArray(matching.matchedTreatedIds),
        matchedControlIds: toArray(matching.matchedControlIds),
        totalMatchedPairs: toScalar(matching.totalMatchedPairs, 0)
      },
      matchingWeights: {
        unitIds,
        weights: toArray(matching.weights),
        subclass: toArray(matching.subclasses)
      },
      sampleAccounting: {
        importedTotal: toScalar(sampleAcc.importedTotal, input.rows.length),
        completeCases: toScalar(sampleAcc.completeCases, input.rows.length),
        treatedTotal: toScalar(sampleAcc.treatedTotal, 0),
        controlTotal: toScalar(sampleAcc.controlTotal, 0),
        matchedTreatedCount: toScalar(sampleAcc.matchedTreatedCount, 0),
        matchedControlCount: toScalar(sampleAcc.matchedControlCount, 0),
        unmatchedTreatedCount: toScalar(sampleAcc.unmatchedTreatedCount, 0),
        unmatchedControlCount: toScalar(sampleAcc.unmatchedControlCount, 0),
        discardedTreatedCount: toScalar(sampleAcc.discardedTreatedCount, 0),
        discardedControlCount: toScalar(sampleAcc.discardedControlCount, 0),
        treatedRetentionRate: toScalar(sampleAcc.treatedRetentionRate, 0.0)
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
      warnings: Array.isArray(unpacked.warnings) ? unpacked.warnings.map(w => ({
        code: toScalar(w.code),
        message: toScalar(w.message),
        severity: toScalar(w.severity),
        impactDescription: toScalar(w.impactDescription)
      })) : [],
      methodProvenance: {
        rCallMatchIt: 'MatchIt::matchit(formula, data, method = "nearest", distance = "glm", link = "linear.logit", estimand = "ATT", m.order = "largest", replace = FALSE, ratio = 1)',
        rCallCobalt: 'cobalt::bal.tab(m_out, s.d.denom = "treated", binary = "raw", un = TRUE)',
        citationBibtexMatchIt: '@article{ho2011matchit, title={MatchIt: Nonparametric Preprocessing for Parametric Causal Inference}, author={Ho, Daniel E and Imai, Kosuke and King, Gary and Stuart, Elizabeth A}, journal={Journal of Statistical Software}, year={2011}}',
        citationBibtexCobalt: '@manual{greifer2024cobalt, title={cobalt: Covariate Balance Tables and Plots}, author={Greifer, Noah}, year={2024}}'
      },
      publicationStatus: {
        verdict: toScalar(pubStatus.verdict, 'OUTPUT_READY'),
        reasons: toArray(pubStatus.reasons).map(r => toScalar(r)),
        outputGenerationAllowed: isTRUE(toScalar(pubStatus.outputGenerationAllowed))
      }
    };
  }
}
