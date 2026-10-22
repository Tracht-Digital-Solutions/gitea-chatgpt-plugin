// Writes build-info.json for the running server: node scripts/build-info.mjs [COMMIT] [OUTPUT]
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = process.argv[2] || 'unknown';
if (!/^([0-9a-f]{7,40}(-dirty)?|unknown)$/.test(commit)) {
  process.stderr.write('Invalid build commit: expected a Git SHA or unknown\n');
  process.exit(1);
}
const { version } = JSON.parse(
  readFileSync(resolve(root, 'package.json'), 'utf8'),
);
writeFileSync(
  resolve(process.argv[3] ?? resolve(root, 'build-info.json')),
  JSON.stringify({ version, commit, builtAt: new Date().toISOString() }) + '\n',
);
