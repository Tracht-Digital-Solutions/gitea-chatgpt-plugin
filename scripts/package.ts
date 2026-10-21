import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import './validate.js';
const version = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version;
const files: Record<string, Uint8Array> = {};
const root = resolve('plugin');
function walk(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('Symlinks are forbidden');
    const p = resolve(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else
      files[relative(root, p).replaceAll('\\', '/')] = new Uint8Array(
        readFileSync(p),
      );
  }
}
walk(root);
// Operator can materialize a concrete HTTPS endpoint without committing deployment details.
if (process.env.MCP_PUBLIC_URL) {
  const u = new URL(process.env.MCP_PUBLIC_URL);
  if (
    u.protocol !== 'https:' ||
    u.username ||
    u.password ||
    u.hash ||
    u.search ||
    u.pathname !== '/mcp'
  )
    throw new Error('MCP_PUBLIC_URL must be https://host/mcp');
  const mcp = JSON.parse(new TextDecoder().decode(files['mcp.json'])) as {
    mcpServers: {
      gitea: {
        url: string;
        extensions: { 'com.openai': { urlTemplates?: string[] } };
      };
    };
  };
  mcp.mcpServers.gitea.url = u.href;
  delete mcp.mcpServers.gitea.extensions['com.openai'].urlTemplates;
  files['mcp.json'] = strToU8(JSON.stringify(mcp, null, 2) + '\n');
}
const archive = zipSync(files, {
  level: 9,
  mtime: new Date('2026-01-01T00:00:00Z'),
});
const checked = unzipSync(archive);
for (const required of [
  'plugin.json',
  'mcp.json',
  'assets/icon.svg',
  'skills/gitea-workflow/SKILL.md',
])
  if (!checked[required]) throw new Error('Archive missing ' + required);
for (const p of Object.keys(checked))
  if (
    p.includes('..') ||
    p.startsWith('/') ||
    /node_modules|\.env|\.key$|\.pem$/.test(p)
  )
    throw new Error('Unsafe archive entry');
mkdirSync('artifacts', { recursive: true });
const name = 'gitea-chatgpt-plugin-' + version + '.zip';
writeFileSync('artifacts/' + name, archive);
writeFileSync(
  'artifacts/SHA256SUMS',
  createHash('sha256').update(archive).digest('hex') + '  ' + name + '\n',
);
process.stdout.write(
  `Archive inspected: ${Object.keys(checked).length} files, ${statSync('artifacts/' + name).size} bytes.\n`,
);
