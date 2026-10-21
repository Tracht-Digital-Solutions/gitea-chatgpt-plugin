import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
const repo = process.argv[2],
  tag = process.argv[3];
if (
  !repo ||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) ||
  !tag ||
  !/^v\d+\.\d+\.\d+$/.test(tag)
)
  throw new Error('Usage: tsx scripts/verify-release.ts owner/repo v0.1.0');
const release = await fetch(
  `https://api.github.com/repos/${repo}/releases/tags/${tag}`,
  {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(15000),
  },
);
if (!release.ok) throw new Error('Public release metadata unavailable');
const metadata = (await release.json()) as {
  assets: { name: string; browser_download_url: string; size: number }[];
};
const files = new Map<string, Uint8Array>();
for (const asset of metadata.assets) {
  if (
    !/^[A-Za-z0-9_.-]+$/.test(asset.name) ||
    asset.name.includes('..') ||
    asset.size > 20 * 1024 * 1024
  )
    throw new Error('Unsafe release asset');
  const url = new URL(asset.browser_download_url);
  if (url.origin !== 'https://github.com')
    throw new Error('Unexpected download origin');
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error('Anonymous download failed');
  const bytes = new Uint8Array(await response.arrayBuffer());
  files.set(asset.name, bytes);
}
const sums = files.get('SHA256SUMS');
if (!sums) throw new Error('Missing checksums');
for (const line of strFromU8(sums).trim().split('\n')) {
  const [expected, name] = line.trim().split(/\s+/);
  const bytes = files.get(name ?? '');
  if (!bytes || createHash('sha256').update(bytes).digest('hex') !== expected)
    throw new Error('Checksum mismatch: ' + name);
}
const zipName = `gitea-chatgpt-plugin-${tag.slice(1)}.zip`;
const zip = files.get(zipName);
if (!zip) throw new Error('Missing plugin ZIP');
const contents = unzipSync(zip);
for (const name of [
  'plugin.json',
  'mcp.json',
  'skills/gitea-workflow/SKILL.md',
  'assets/icon.svg',
])
  if (!contents[name]) throw new Error('Missing plugin component');
const manifest = JSON.parse(strFromU8(contents['plugin.json']!)) as {
  version: string;
};
if (manifest.version !== tag.slice(1))
  throw new Error('Plugin version mismatch');
const digest = strFromU8(
  files.get('container-digest.txt') ?? new Uint8Array(),
).trim();
if (!/^sha256:[a-f0-9]{64}$/.test(digest))
  throw new Error('Invalid container digest');
process.stdout.write(
  `Anonymous release download verified: ${tag}, ${files.size} assets, ZIP contents and SHA-256 checksums valid. Image: ${digest}\n`,
);
