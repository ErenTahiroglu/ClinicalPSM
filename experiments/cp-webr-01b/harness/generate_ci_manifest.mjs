// CP-WEBR-01B Post-Run CI Evidence Manifest Generator
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
    manifest_version: '1.1.0',
    generated_at: new Date().toISOString(),
    commit_sha: commitSha,
    environment: {
      operating_system: `${os.platform()} ${os.release()} (${os.arch()})`,
      node_version: process.version,
      ci_runner: process.env.CI ? 'GITHUB_ACTIONS' : 'LOCAL_DEVELOPMENT'
    },
    provenance_classification: {
      category_1_tracked_reference_artifacts: [
        'experiments/cp-webr-01b/fixtures/fix_01_oracle_full_precision.json',
        'experiments/cp-webr-00b/native-reference/native_results.json'
      ],
      category_2_fresh_ci_execution_artifacts: [
        'experiments/cp-webr-01b/BROWSER-CI-QUALIFICATION-REPORT.json',
        'experiments/cp-webr-01b/WEBR-BINDING-QUALIFICATION.json',
        'experiments/cp-webr-01b/SECURITY-FALSIFICATION-RESULTS.json',
        'experiments/cp-webr-01b/INDEXEDDB-LIFECYCLE-AUDIT.json',
        'experiments/cp-webr-01b/CSP-QUALIFICATION.json',
        'experiments/cp-webr-01b/ALIAS-AND-SERIALIZATION-TESTS.json'
      ],
      category_3_historical_local_outputs: [
        'experiments/cp-webr-00b/parity-results.json',
        'experiments/cp-webr-00b/browser-privacy-audit.json'
      ]
    },
    artifacts: {}
  };

  const evidenceFiles = [
    'experiments/cp-webr-01b/BROWSER-CI-QUALIFICATION-REPORT.json',
    'experiments/cp-webr-01b/WEBR-BINDING-QUALIFICATION.json',
    'experiments/cp-webr-01b/SECURITY-FALSIFICATION-RESULTS.json',
    'experiments/cp-webr-01b/INDEXEDDB-LIFECYCLE-AUDIT.json',
    'experiments/cp-webr-01b/CSP-QUALIFICATION.json',
    'experiments/cp-webr-01b/ALIAS-AND-SERIALIZATION-TESTS.json',
    'experiments/cp-webr-01b/fixtures/fix_01_oracle_full_precision.json'
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

  const outPath = path.resolve('experiments/cp-webr-01b/CI-EVIDENCE-MANIFEST.json');
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf-8');
  console.log('Successfully generated post-run CI evidence manifest:', outPath);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateCiEvidenceManifest();
}
