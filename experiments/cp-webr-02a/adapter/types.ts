/**
 * CP-WEBR-02A TypeScript Input & Result Contracts
 * In accordance with docs/science/CP-WEBR-01-CANONICAL-RESULT-CONTRACT.md
 * and docs/architecture/CP-WEBR-01-PRODUCTION-ARCHITECTURE.md
 */

export type CovariateType = 'continuous' | 'binary' | 'categorical';

export interface CovariateDefinition {
  originalHeader: string;
  inferredType: CovariateType;
  referenceLevel?: string;
}

export interface MatchingOptions {
  method?: 'nearest';
  distanceMetric?: 'linear.logit' | 'logit';
  ratio?: 1;
  replace?: false;
  matchingOrder?: 'largest';
  caliper?: number | null;
  stdCaliper?: boolean;
}

export interface DatasetInput {
  datasetId: string;
  headers: string[];
  rows: Array<Record<string, string | number | null>>;
  treatmentVariable: string;
  covariates: string[];
  options?: MatchingOptions;
}

export interface IngestionValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  completeCasesCount: number;
  excludedRowsCount: number;
  factorConfiguration: Record<string, {
    originalHeader: string;
    internalAlias: string;
    displayName: string;
    inferredType: CovariateType;
    levels: string[];
    referenceLevel: string | null;
    droppedLevel: string | null;
  }>;
}

export interface CanonicalPsmResult {
  metadata: {
    runId: string;
    parentRunId: string | null;
    timestamp: string;
    seed: number | null;
    executionDurationMs: number;
    platform: {
      userAgent: string;
      cores: number;
    };
  };
  inputFingerprint: {
    datasetSha256: string;
    canonicalResultSha256: string;
    totalRows: number;
    completeCases: number;
    excludedRows: number;
    exclusionReasonSummary: Record<string, number>;
  };
  toolchain: {
    webrVersion: '0.6.0';
    rVersion: '4.6.0';
    emscriptenVersion: '5.0.7';
    matchItVersion: '4.8.1';
    cobaltVersion: '5.0.0';
    dependencySha256s: Record<string, string>;
  };
  matchingConfiguration: {
    treatmentVariable: string;
    covariates: string[];
    distanceMetric: 'linear.logit' | 'logit';
    method: 'nearest';
    ratio: number;
    replace: boolean;
    matchingOrder: 'largest';
    caliper: number | null;
    stdCaliper: boolean;
    effectiveCaliperWidthRaw: number | null;
    caliperScaleDescription: string;
  };
  factorConfiguration: Record<string, {
    originalHeader: string;
    internalAlias: string;
    displayName: string;
    inferredType: CovariateType;
    levels: string[];
    referenceLevel: string | null;
    droppedLevel: string | null;
  }>;
  propensityScores: {
    unitIds: string[];
    treatment: number[];
    propensityScores: number[];
    linearLogits: (number | null)[];
  };
  matchMatrix: {
    treatedIds: string[];
    matchedControlIds: (string | null)[];
    pairDistances: (number | null)[];
  };
  matchedUnits: {
    matchedTreatedIds: string[];
    matchedControlIds: string[];
    totalMatchedPairs: number;
  };
  matchingWeights: {
    unitIds: string[];
    weights: number[];
    subclass: (number | null)[];
  };
  sampleAccounting: {
    importedTotal: number;
    completeCases: number;
    treatedTotal: number;
    controlTotal: number;
    matchedTreatedCount: number;
    matchedControlCount: number;
    unmatchedTreatedCount: number;
    unmatchedControlCount: number;
    discardedTreatedCount: number;
    discardedControlCount: number;
    treatedRetentionRate: number;
  };
  balanceTable: Array<{
    covariateName: string;
    originalHeader: string;
    displayName: string;
    type: 'continuous' | 'binary' | 'categorical_level';
    unadjustedTreatedMean: number | null;
    unadjustedTreatedSd: number | null;
    unadjustedControlMean: number | null;
    unadjustedControlSd: number | null;
    unadjustedSmd: number | null;
    rawDifferenceUnadjusted: number | null;
    matchedTreatedMean: number | null;
    matchedTreatedSd: number | null;
    matchedControlMean: number | null;
    matchedControlSd: number | null;
    matchedSmd: number | null;
    rawDifferenceMatched: number | null;
    smdReductionPercent: number | null;
    unadjustedVarianceRatio: number | null;
    matchedVarianceRatio: number | null;
    heuristicStatus: 'balanced_smd_and_vr' | 'borderline_smd' | 'imbalanced_smd' | 'residual_variance_disparity';
  }>;
  numericalDiagnostics: {
    glmConvergence: boolean;
    glmIterations: number;
    glmNullDeviance: number | null;
    glmResidualDeviance: number | null;
    maxAbsoluteCoefficient: number | null;
    maxCoefficientStandardError: number | null;
    coefficientTable: Array<{
      term: string;
      estimate: number | null;
      standardError: number | null;
      zValue: number | null;
      pValue: number | null;
      aliased: boolean;
    }>;
    rubinB: number | null;
    rubinR: number | null;
  };
  warnings: Array<{
    code: 'WARN_SUSPECTED_SEPARATION' | 'WARN_OFF_SUPPORT' | 'WARN_CALIPER_ATTRITION' | 'WARN_RANK_DEFICIENT' | 'WARN_MISSING_EXCLUSION';
    message: string;
    severity: 'informational' | 'warning' | 'fatal';
    impactDescription: string;
  }>;
  methodProvenance: {
    rCallMatchIt: string;
    rCallCobalt: string;
    citationBibtexMatchIt: string;
    citationBibtexCobalt: string;
  };
  publicationStatus: {
    verdict: 'OUTPUT_READY' | 'OUTPUT_GENERATION_RESTRICTED' | 'COMPUTATION_FAILED';
    reasons: string[];
    outputGenerationAllowed: boolean;
  };
}

export type WorkerState =
  | 'NOT_LOADED'
  | 'INITIALIZING'
  | 'READY'
  | 'RUNNING'
  | 'CANCELLING'
  | 'COMPLETED'
  | 'RECOVERABLE_ERROR'
  | 'BLOCKED';

export interface WorkerMessage<T = unknown> {
  type: string;
  id?: string;
  payload?: T;
  error?: string;
}
