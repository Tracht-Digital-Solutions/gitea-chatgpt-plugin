import process from 'node:process';
import console from 'node:console';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { parseEnv } from 'node:util';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const supported = new Set([
  '--init',
  '--check',
  '--start',
  '--no-docker',
  '--help',
  '--config',
]);
let envFile = resolve(root, '.env');
for (let i = 0; i < args.length; i++) {
  if (!supported.has(args[i])) throw new Error('Unknown option: ' + args[i]);
  if (args[i] === '--config') {
    if (!args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('--config requires a path');
    envFile = resolve(args[++i]);
  }
}
if (args.includes('--help')) {
  console.log(
    'node scripts/install.mjs [--init | --check] [--start] [--no-docker] [--config PATH]',
  );
  console.log(
    '--init prepares .env without overwriting it; --check validates it; default builds server/plugin/Docker; --start also starts Compose.',
  );
  process.exit(0);
}
if (!args.includes('--check')) {
  const example = readFileSync(resolve(root, '.env.example'), 'utf8');
  try {
    // Exclusive creation is the only check: no existence-check/write race.
    writeFileSync(
      envFile,
      example.replace(
        /^ENCRYPTION_KEY=.*$/m,
        'ENCRYPTION_KEY=' + randomBytes(32).toString('hex'),
      ),
      { flag: 'wx', mode: 0o600 },
    );
    console.log(
      'Konfiguration angelegt: ' +
        envFile +
        '. Eigene Server-/OAuth-Adressen eintragen und das Skript erneut starten.',
    );
    process.exit(args.includes('--start') ? 2 : 0);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}
if (args.includes('--init')) {
  console.log('Vorhandene Konfiguration bleibt unverändert: ' + envFile);
  process.exit(0);
}

function settings() {
  const env = parseEnv(readFileSync(envFile, 'utf8'));
  const invalid = [];
  for (const name of [
    'PUBLIC_URL',
    'OAUTH_ISSUER',
    'OAUTH_JWKS_URL',
    'OAUTH_AUTHORIZATION_URL',
    'OAUTH_TOKEN_URL',
    'OAUTH_AUDIENCE',
  ]) {
    try {
      const url = new URL(env[name]);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        /(^|\.)example\.(org|com|net)$/i.test(url.hostname) ||
        /^(your-|dein-)/i.test(url.hostname)
      )
        invalid.push(name);
      if (
        name === 'PUBLIC_URL' &&
        (url.pathname !== '/' || url.search || url.hash)
      )
        invalid.push(name);
    } catch {
      invalid.push(name);
    }
  }
  if (!/^[a-fA-F0-9]{64}$/.test(env.ENCRYPTION_KEY ?? ''))
    invalid.push('ENCRYPTION_KEY');
  for (const name of ['PORTAL_CLIENT_ID', 'MCP_CLIENT_ID'])
    if (!env[name]?.trim()) invalid.push(name);
  if (!['true', 'false'].includes(env.ALLOW_USER_SERVERS ?? 'false'))
    invalid.push('ALLOW_USER_SERVERS');
  if (
    !/^\d+$/.test(env.PORT ?? '3000') ||
    Number(env.PORT ?? '3000') < 1 ||
    Number(env.PORT ?? '3000') > 65535
  )
    invalid.push('PORT');
  try {
    const instances = JSON.parse(env.GITEA_INSTANCES ?? '[]');
    if (
      !Array.isArray(instances) ||
      (env.ALLOW_USER_SERVERS !== 'true' && instances.length === 0)
    )
      throw new Error();
    for (const instance of instances) {
      const url = new URL(instance.url);
      if (
        url.protocol !== 'https:' ||
        /(^|\.)example\.(org|com|net)$/i.test(url.hostname) ||
        /^(your-|dein-)/i.test(url.hostname)
      )
        throw new Error();
    }
  } catch {
    invalid.push('GITEA_INSTANCES');
  }
  if (invalid.length)
    throw new Error(
      'Bitte echte, gültige Werte in .env setzen: ' +
        [...new Set(invalid)].join(', ') +
        '. Keine Secrets im Chat teilen.',
    );
  return env;
}

function run(command, values, env = process.env) {
  // Windows batch launch uses fixed commands; paths and configuration values never become shell code.
  const windowsPnpm = process.platform === 'win32' && command === 'pnpm';
  const pnpmCommands = {
    'install --frozen-lockfile --prod=false':
      'pnpm install --frozen-lockfile --prod=false',
    build: 'pnpm build',
    package: 'pnpm package',
  };
  const batch = Object.hasOwn(pnpmCommands, values.join(' '))
    ? pnpmCommands[values.join(' ')]
    : undefined;
  if (windowsPnpm && !batch) throw new Error('Unsupported pnpm build step');
  const options = { cwd: root, env, stdio: 'inherit', windowsHide: true };
  const result = windowsPnpm
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', batch], options)
    : spawnSync(command, values, options);
  if (result.error || result.status !== 0)
    throw new Error(
      'Schritt fehlgeschlagen: ' + command + ' ' + values.join(' '),
    );
}

try {
  const env = settings();
  if (args.includes('--check')) {
    console.log(
      'Installationskonfiguration geprüft; keine Secrets ausgegeben.',
    );
    process.exit(0);
  }
  if (args.includes('--start') && args.includes('--no-docker'))
    throw new Error('--start requires Docker');
  run('pnpm', ['install', '--frozen-lockfile', '--prod=false']);
  run('pnpm', ['build']);
  const { loadConfig } =
    await import('../dist/apps/mcp-server/src/config/index.js');
  // Only field names escape validation errors, never secret values.
  try {
    loadConfig(env);
  } catch {
    throw new Error(
      'Serverkonfiguration ungültig. Pflichtfelder und GITEA_INSTANCES anhand von .env.example prüfen.',
    );
  }
  const endpoint = new URL('/mcp', env.PUBLIC_URL).href;
  run('pnpm', ['package'], {
    ...process.env,
    MCP_PUBLIC_URL: endpoint,
    MCP_CLIENT_ID: env.MCP_CLIENT_ID,
  });
  mkdirSync(resolve(root, 'artifacts'), { recursive: true });
  writeFileSync(
    resolve(root, 'artifacts/chatgpt-connection.json'),
    JSON.stringify(
      {
        name: 'Gitea for ChatGPT',
        serverUrl: endpoint,
        authentication: 'OAuth',
        clientId: env.MCP_CLIENT_ID,
        authorizationUrl: env.OAUTH_AUTHORIZATION_URL,
        tokenUrl: env.OAUTH_TOKEN_URL,
        scopes: ['gitea.read', 'gitea.write'],
      },
      null,
      2,
    ) + '\n',
  );
  if (!args.includes('--no-docker')) {
    const dockerEnv = { ...process.env, ...env, GITEA_ENV_FILE: envFile };
    run('docker', ['compose', '--env-file', envFile, 'build'], dockerEnv);
    if (args.includes('--start'))
      run(
        'docker',
        ['compose', '--env-file', envFile, 'up', '-d', '--no-build', '--wait'],
        dockerEnv,
      );
  }
  console.log(
    'Build fertig. Plugin-ZIP und öffentliche Verbindungsdaten: artifacts/. Einstellungen bleiben ausschließlich in ' +
      envFile,
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
