#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(outputDir)) throw new Error('E4 evidence output directory is required');
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const reportPath = path.join(outputDir, 'e4-closure-qualification.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

function walk(directory, prefix = '') {
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relative === 'e4-evidence-index.json' || relative === 'SHA256SUMS') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`E4 evidence may not contain symlinks: ${relative}`);
    if (entry.isDirectory()) rows.push(...walk(absolute, relative));
    else if (entry.isFile()) {
      const bytes = fs.readFileSync(absolute);
      rows.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return rows;
}

const index = {
  schema: 'CP-WEBR-02-CLOSURE-1-E4-evidence-index-v1',
  evidence_classification: 'CANDIDATE_AMENDMENT_QUALIFICATION_NOT_PHASE_CLOSURE',
  final_verdict: report.final_verdict,
  self_declared_closure: report.self_declared_closure,
  commit_sha: report.commit_sha,
  workflow_run_id: report.workflow_run_id,
  source_artifacts: report.evidence.workflow_artifact_verification?.artifacts || report.evidence.workflow_artifact_verification,
  outcome_summary: report.summary,
  files: walk(outputDir)
};
const indexBytes = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(outputDir, 'e4-evidence-index.json'), indexBytes);
const checksumFiles = [...index.files.map(row => row.path), 'e4-evidence-index.json'].sort();
const sums = checksumFiles.map(relative => `${sha256(fs.readFileSync(path.join(outputDir, relative)))}  ${relative}`).join('\n');
fs.writeFileSync(path.join(outputDir, 'SHA256SUMS'), `${sums}\n`);
process.stdout.write(`${JSON.stringify({ file_count: checksumFiles.length, index_sha256: sha256(indexBytes), sha256sums_sha256: sha256(fs.readFileSync(path.join(outputDir, 'SHA256SUMS'))) }, null, 2)}\n`);
