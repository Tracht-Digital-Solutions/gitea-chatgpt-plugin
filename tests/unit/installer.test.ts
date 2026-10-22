import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
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

it('documents update/status, refuses Docker-only modes without Docker and never creates config for --status', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base, 'gitea-installer-modes-'));
  if (!directory.startsWith(base + sep))
    throw new Error('Unsafe test directory');
  const file = resolve(directory, '.env');
  const script = resolve('scripts/install.mjs');
  const run = (...flags: string[]) =>
    spawnSync(process.execPath, [script, ...flags, '--config', file], {
      encoding: 'utf8',
    });
  try {
    expect(run('--help').stdout).toMatch(/--update[\s\S]*--status/);
    expect(run('--status').status).toBe(1);
    expect(existsSync(file)).toBe(false);
    run('--init');
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replaceAll('example.org', 'install.test')
        .replace(
          'GITEA_INSTANCES=[]',
          'GITEA_INSTANCES=[{"id":"own","url":"https://git.install.test"}]',
        ),
    );
    const secret = parseEnv(readFileSync(file, 'utf8')).ENCRYPTION_KEY!;
    for (const mode of ['--start', '--update', '--status']) {
      const refused = run(mode, '--no-docker');
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('require Docker');
      expect(refused.stdout + refused.stderr).not.toContain(secret);
    }
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'REQUIRE_WRITE_APPROVAL=false',
        'REQUIRE_WRITE_APPROVAL=off',
      ),
    );
    expect(run('--check').stderr).toContain('REQUIRE_WRITE_APPROVAL');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('embeds only a validated build commit in build-info.json', () => {
  const base = resolve(tmpdir());
  const directory = mkdtempSync(resolve(base, 'gitea-build-info-'));
  if (!directory.startsWith(base + sep))
    throw new Error('Unsafe test directory');
  const out = resolve(directory, 'build-info.json');
  const script = resolve('scripts/build-info.mjs');
  try {
    const sha = 'd'.repeat(40) + '-dirty';
    execFileSync(process.execPath, [script, sha, out]);
    const info = JSON.parse(readFileSync(out, 'utf8')) as Record<
      string,
      string
    >;
    expect(info).toMatchObject({
      commit: sha,
      version: (
        JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
      ).version,
    });
    expect(new Date(info.builtAt!).getTime()).toBeGreaterThan(0);
    rmSync(out);
    for (const bad of ['main', '$(id)', 'abc'])
      expect(spawnSync(process.execPath, [script, bad, out]).status).toBe(1);
    expect(existsSync(out)).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
