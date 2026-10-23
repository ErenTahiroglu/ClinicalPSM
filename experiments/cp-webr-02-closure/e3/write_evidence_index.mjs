#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

if (!process.argv[2]) throw new Error('Evidence output directory is required');
const outputDir = path.resolve(process.argv[2]);
if (!fs.existsSync(outputDir)) throw new Error('Evidence output directory does not exist');
const pinsPath = path.resolve('experiments/cp-webr-02-closure/e3/evidence-pins.json');
const pins = JSON.parse(fs.readFileSync(pinsPath, 'utf8'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const digest = name => {
  const bytes = fs.readFileSync(path.join(outputDir, name));
  return { name, bytes: bytes.length, sha256: hash(bytes) };
};
const fileNames = fs.readdirSync(outputDir).filter(name => name !== 'e3-evidence-index.json' && name !== 'SHA256SUMS').sort();
const report = JSON.parse(fs.readFileSync(path.join(outputDir, 'e3-adjudication-report.json'), 'utf8'));
const index = {
  schema: 'CP-WEBR-02-CLOSURE-1-E3-evidence-index-v1',
  evidence_class: 'CANDIDATE_ERRATUM_QUALIFICATION_NOT_CLOSURE',
  final_verdict: report.final_verdict,
  commit_sha: process.env.GITHUB_SHA || report.commit_sha,
  workflow_run_id: process.env.GITHUB_RUN_ID || report.workflow_run_id,
  source_evidence: {
    original_25_fixture_run_id: pins.original_25_fixture_evidence.workflow_run_id,
    original_25_fixture_artifact_id: pins.original_25_fixture_evidence.artifact_id,
    original_25_fixture_artifact_digest: pins.original_25_fixture_evidence.artifact_digest,
    original_25_fixture_archive_sha256: pins.original_25_fixture_evidence.evidence_archive_sha256,
    e2_run_id: pins.e2_scientific_evidence.workflow_run_id,
    e2_artifact_id: pins.e2_scientific_evidence.artifact_id,
    e2_artifact_digest: pins.e2_scientific_evidence.artifact_digest,
    e2_archive_sha256: pins.e2_scientific_evidence.evidence_archive_sha256,
    candidate_reference_sha256: pins.frozen.candidate_native_reference_sha256
  },
  summary: report.summary,
  files: fileNames.map(digest)
};
fs.writeFileSync(path.join(outputDir, 'e3-evidence-index.json'), `${JSON.stringify(index, null, 2)}\n`);
const checksummed = [...fileNames, 'e3-evidence-index.json'].sort();
const sums = checksummed.map(name => `${digest(name).sha256}  ${name}`).join('\n');
fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${sums}\n`);
process.stdout.write(`${JSON.stringify({ output_files: checksummed.length, evidence_index_sha256: hash(fs.readFileSync(path.join(outputDir, 'e3-evidence-index.json'))) }, null, 2)}\n`);
