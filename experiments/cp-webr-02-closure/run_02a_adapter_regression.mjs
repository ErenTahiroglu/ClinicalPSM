import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'experiments/cp-webr-02a');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-webr-02a-adapter-regression-'));
const output = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (!output) throw new Error('Usage: node run_02a_adapter_regression.mjs <new-output-directory>');
if (fs.existsSync(output)) throw new Error(`Refusing to overwrite regression output: ${output}`);

try {
  const fixtureRoot = path.join(temporaryRoot, 'experiments/cp-webr-02a');
  fs.mkdirSync(path.join(fixtureRoot, 'harness'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'adapter'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'r1.2a'), { recursive: true });
  for (const entry of fs.readdirSync(path.join(source, 'adapter'), { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.mjs')) fs.copyFileSync(path.join(source, 'adapter', entry.name), path.join(fixtureRoot, 'adapter', entry.name));
  }
  fs.copyFileSync(path.join(source, 'harness/test_adapter_unit.mjs'), path.join(fixtureRoot, 'harness/test_adapter_unit.mjs'));
  const execution = spawnSync(process.execPath, ['experiments/cp-webr-02a/harness/test_adapter_unit.mjs'], {
    cwd: temporaryRoot, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024
  });
  process.stdout.write(execution.stdout || '');
  process.stderr.write(execution.stderr || '');
  fs.mkdirSync(output, { recursive: true });
  const reports = [
    ['experiments/cp-webr-02a/ADAPTER-UNIT-TESTS.json', 'adapter-unit-tests.json'],
    ['experiments/cp-webr-02a/r1.2a/WORKER-FATAL-ERROR-SETTLEMENT-AUDIT.json', 'worker-fatal-settlement-audit.json']
  ];
  for (const [sourcePath, destination] of reports) {
    const from = path.join(temporaryRoot, sourcePath);
    if (fs.existsSync(from)) fs.copyFileSync(from, path.join(output, destination));
  }
  if (execution.error) throw execution.error;
  if (execution.status !== 0) process.exitCode = execution.status || 1;
  else console.log(`CP-WEBR-02A adapter unit regression reports copied to ${output}`);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
