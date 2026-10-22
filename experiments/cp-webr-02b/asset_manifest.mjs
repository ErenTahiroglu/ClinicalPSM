import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve('apps/web/public');
const outputPath = process.argv.indexOf('--out') >= 0 ? process.argv[process.argv.indexOf('--out') + 1] : null;
if (!fs.existsSync(root)) throw new Error(`Built static application not found: ${root}`);

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (entry.isFile()) files.push({ path: path.relative(root, absolute).split(path.sep).join('/'), bytes: fs.statSync(absolute).size });
  }
}
walk(root);
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
const largestFile = files.reduce((largest, file) => file.bytes > largest.bytes ? file : largest, { path: '', bytes: 0 });
const manifestSha256 = crypto.createHash('sha256').update(files.map(file => `${file.path}\t${file.bytes}`).join('\n')).digest('hex');
const manifest = { fileCount: files.length, totalBytes, largestFile, manifestSha256, files };
const json = `${JSON.stringify(manifest, null, 2)}\n`;
if (outputPath) {
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, json);
} else {
  process.stdout.write(json);
}
