import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { expect, it } from 'vitest';
import { parseEnv } from 'node:util';

it('creates a private config once, preserves the key and refuses placeholders without printing secrets', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base, 'gitea-installer-unit-'));
  if (!directory.startsWith(base + sep))
    throw new Error('Unsafe test directory');
  const file = resolve(directory, '.env');
  const script = resolve('scripts/install.mjs');
  const run = (flag: string) =>
    execFileSync(process.execPath, [script, flag, '--config', file], {
      encoding: 'utf8',
    });
  try {
    expect(
      spawnSync(process.execPath, [script, '--check', '--config', file]).status,
    ).toBe(1);
    run('--init');
    const first = readFileSync(file, 'utf8');
    const secret = parseEnv(first).ENCRYPTION_KEY!;
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    run('--init');
    expect(readFileSync(file, 'utf8')).toBe(first);
    const rejected = spawnSync(
      process.execPath,
      [script, '--check', '--config', file],
      { encoding: 'utf8' },
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('PUBLIC_URL');
    expect(rejected.stderr).not.toContain(secret);
    writeFileSync(
      file,
      first
        .replaceAll('example.org', 'install.test')
        .replace(
          'GITEA_INSTANCES=[]',
          'GITEA_INSTANCES=[{"id":"own","url":"https://git.install.test"}]',
        ),
    );
    expect(run('--check')).toContain('geprüft');
    expect(readFileSync(file, 'utf8')).toContain(secret);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
