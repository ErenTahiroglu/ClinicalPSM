// CP-WEBR-02A Post-Run CI Evidence Manifest Generator
// Creates a distinct, non-self-referential cryptographic manifest of all freshly generated test evidence

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import os from 'node:os';

function getGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return process.env.GITHUB_SHA || 'UNKNOWN_COMMIT_SHA';
  }
}

export function generateCiEvidenceManifest() {
  const commitSha = getGitCommitSha();
  const manifest = {
    manifest_type: 'POST_RUN_CI_EVIDENCE_MANIFEST',
    manifest_version: '2.0.0',
    generated_at: new Date().toISOString(),
    commit_sha: commitSha,
    environment: {
      operating_system: `${os.platform()} ${os.release()} (${os.arch()})`,
      node_version: process.version,
      ci_runner: process.env.CI ? 'GITHUB_ACTIONS' : 'LOCAL_DEVELOPMENT'
    },
    provenance_classification: {
      category_1_tracked_reference_artifacts: [
        'experiments/cp-webr-02a/fixtures/fix_01_oracle_full_precision.json'
      ],
      category_2_fresh_ci_execution_artifacts: [
        'experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json',
        'experiments/cp-webr-02a/SCIENTIFIC-PARITY-RESULTS.json',
        'experiments/cp-webr-02a/CSP-AB-QUALIFICATION.json',
        'experiments/cp-webr-02a/WORKER-LIFECYCLE-AUDIT.json',
        'experiments/cp-webr-02a/STORAGE-PRIVACY-AUDIT.json',
        'experiments/cp-webr-02a/BROWSER-CI-QUALIFICATION-REPORT.json',
        'experiments/cp-webr-02a/r1.1/FIXTURE-ASSERTION-MATRIX.json',
        'experiments/cp-webr-02a/r1.2/FIXTURE-ASSERTION-MATRIX.json',
        'experiments/cp-webr-02a/r1.2/MUTATION-FALSIFICATION-AUDIT.json',
        'experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-REFERENCE.json',
        'experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json',
        'experiments/cp-webr-02a/r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json',
        'experiments/cp-webr-02a/r1.2a/NUMERICAL-MUTATION-FALSIFICATION-AUDIT.json',
        'experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json'
      ]
    },
    artifacts: {}
  };

  const evidenceFiles = [
    'experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json',
    'experiments/cp-webr-02a/SCIENTIFIC-PARITY-RESULTS.json',
    'experiments/cp-webr-02a/CSP-AB-QUALIFICATION.json',
    'experiments/cp-webr-02a/WORKER-LIFECYCLE-AUDIT.json',
    'experiments/cp-webr-02a/STORAGE-PRIVACY-AUDIT.json',
    'experiments/cp-webr-02a/BROWSER-CI-QUALIFICATION-REPORT.json',
    'experiments/cp-webr-02a/r1.1/FIXTURE-ASSERTION-MATRIX.json',
    'experiments/cp-webr-02a/r1.2/FIXTURE-ASSERTION-MATRIX.json',
    'experiments/cp-webr-02a/r1.2/MUTATION-FALSIFICATION-AUDIT.json',
    'experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-REFERENCE.json',
    'experiments/cp-webr-02a/r1.2a/COBALT-NUMERICAL-COMPARISON-MATRIX.json',
    'experiments/cp-webr-02a/r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json',
    'experiments/cp-webr-02a/r1.2a/NUMERICAL-MUTATION-FALSIFICATION-AUDIT.json',
    'experiments/cp-webr-02a/r1.2a/FIXTURE-ASSERTION-MATRIX.json',
    'experiments/cp-webr-02a/fixtures/fix_01_oracle_full_precision.json'
  ];

  for (const rel of evidenceFiles) {
    const full = path.resolve(rel);
    if (!fs.existsSync(full)) {
      console.warn(`Warning: Evidence file does not exist: ${rel}`);
      continue;
    }
    const buf = fs.readFileSync(full);
    manifest.artifacts[rel] = {
      bytes: buf.length,
      sha256: crypto.createHash('sha256').update(buf).digest('hex')
    };
  }

  const outPath = path.resolve('experiments/cp-webr-02a/CI-EVIDENCE-MANIFEST.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('Successfully generated post-run CI evidence manifest:', outPath);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateCiEvidenceManifest();
}
