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
  '--update',
  '--status',
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
    'node scripts/install.mjs [--init | --check | --status | --update] [--start] [--no-docker] [--config PATH]',
  );
  console.log(
    '--init prepares .env without overwriting it; --check validates it; default builds server/plugin/Docker image only; --start also replaces the running container and verifies it; --update pulls the current Git branch (fast-forward only) and then runs --start; --status verifies the running container without changes.',
  );
  process.exit(0);
}
if (!args.includes('--check') && !args.includes('--status')) {
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
    process.exit(args.includes('--start') || args.includes('--update') ? 2 : 0);
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
  if (!['true', 'false'].includes(env.REQUIRE_WRITE_APPROVAL ?? 'false'))
    invalid.push('REQUIRE_WRITE_APPROVAL');
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

/** Captures output for checks; failures name only the command, never its output. */
function capture(command, values, env = process.env) {
  const result = spawnSync(command, values, {
    cwd: root,
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0)
    throw new Error(
      'Schritt fehlgeschlagen: ' + command + ' ' + values.slice(0, 3).join(' '),
    );
  return result.stdout.trim() + '\n' + result.stderr.trim();
}

function git(values) {
  const result = spawnSync('git', ['-C', root, ...values], {
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return result.status === 0 ? result.stdout.trim() : undefined;
}

// Only a checkout whose top level is this project counts; an enclosing repository is ignored.
function checkout() {
  const top = git(['rev-parse', '--show-toplevel']);
  return top !== undefined && resolve(top) === root;
}

function sourceCommit() {
  const head = checkout() ? git(['rev-parse', 'HEAD']) : undefined;
  if (!head || !/^[0-9a-f]{40}$/.test(head)) return 'unknown';
  return (
    head +
    (git(['status', '--porcelain', '--untracked-files=no']) ? '-dirty' : '')
  );
}

const image = 'gitea-chatgpt-plugin:local';
const lines = (text) => text.split(/\r?\n/).filter(Boolean);
const inspect = (id, format) =>
  lines(capture('docker', ['inspect', '--format', format, id]))[0] ?? '';

/** Proves which build and approval mode the running Compose container uses; prints no configuration values. */
function verifyDeployment(dockerEnv, env, expectedCommit) {
  const ids = lines(
    capture(
      'docker',
      ['compose', '--env-file', envFile, 'ps', '-q', 'mcp'],
      dockerEnv,
    ),
  );
  if (ids.length !== 1)
    throw new Error(
      'Kein laufender MCP-Container dieses Compose-Projekts gefunden. Mit --start starten.',
    );
  const [id] = ids;
  const problems = [];
  const built = lines(
    capture('docker', ['image', 'inspect', '--format', '{{.Id}}', image]),
  )[0];
  if (inspect(id, '{{.Image}}') !== built)
    problems.push('Container läuft nicht mit dem zuletzt gebauten ' + image);
  const revision = inspect(
    id,
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  );
  if (expectedCommit && revision !== expectedCommit)
    problems.push(
      'Build-Commit ' +
        (revision || 'unbekannt') +
        ' entspricht nicht dem Quellstand ' +
        expectedCommit,
    );
  const health = inspect(
    id,
    '{{if .State.Health}}{{.State.Health.Status}}{{end}}',
  );
  if (health !== 'healthy')
    problems.push('Healthcheck ' + (health || 'unbekannt'));
  // The server logs exactly one secret-free startup line; only that line is printed.
  const ready = lines(capture('docker', ['logs', id]))
    .filter((line) => line.startsWith('Gitea MCP server ready'))
    .at(-1);
  const wanted =
    (env.REQUIRE_WRITE_APPROVAL ?? 'false') === 'true'
      ? 'required'
      : 'disabled';
  const effective = /writeApproval=(required|disabled)/.exec(ready ?? '')?.[1];
  if (effective !== wanted)
    problems.push(
      'effektiver Freigabemodus ' +
        (effective ?? 'unbekannt (Startmeldung fehlt, Image veraltet?)') +
        ', erwartet laut ' +
        envFile +
        ': ' +
        wanted,
    );
  // Another running instance (other Compose project or docker run) may still receive proxy traffic.
  const running = lines(capture('docker', ['ps', '-q']));
  const others = lines(
    capture('docker', [
      'inspect',
      '--format',
      '{{.Id}} {{.Name}} {{.Config.Image}} {{index .Config.Labels "org.opencontainers.image.title"}}',
      ...running,
    ]),
  )
    .map((line) => line.split(' '))
    .filter(
      ([other, , ref, title]) =>
        !other.startsWith(id) &&
        (ref?.includes('gitea-chatgpt-plugin') ||
          title === 'gitea-chatgpt-plugin'),
    )
    .map(([, name]) => name.replace(/^\//, ''));
  console.log(
    'Laufender Container: ' + inspect(id, '{{.Name}}').replace(/^\//, ''),
  );
  console.log('Build-Commit: ' + (revision || 'unbekannt'));
  console.log('Healthcheck: ' + (health || 'unbekannt'));
  console.log('Startmeldung: ' + (ready ?? 'nicht gefunden'));
  if (others.length)
    console.warn(
      'WARNUNG: Weitere Gitea-MCP-Container laufen: ' +
        others.join(', ') +
        '. Prüfen, ob der Reverse Proxy auf einen davon zeigt, und veraltete Instanzen stoppen.',
    );
  if (problems.length)
    throw new Error(
      'Deployment-Prüfung fehlgeschlagen: ' + problems.join('; '),
    );
  console.log('Deployment-Prüfung erfolgreich, Schreibfreigabe: ' + wanted);
}

try {
  const env = settings();
  if (args.includes('--check')) {
    console.log(
      'Installationskonfiguration geprüft; keine Secrets ausgegeben.',
    );
    process.exit(0);
  }
  if (
    args.includes('--no-docker') &&
    ['--start', '--update', '--status'].some((a) => args.includes(a))
  )
    throw new Error('--start, --update and --status require Docker');
  const commit = sourceCommit();
  const expected = commit === 'unknown' ? undefined : commit;
  const dockerEnv = {
    ...process.env,
    ...env,
    GITEA_ENV_FILE: envFile,
    BUILD_COMMIT: commit,
    BUILD_VERSION: JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8'),
    ).version,
  };
  if (args.includes('--status')) {
    verifyDeployment(dockerEnv, env, expected);
    process.exit(0);
  }
  if (args.includes('--update')) {
    if (!checkout())
      throw new Error('--update benötigt einen Git-Checkout dieses Projekts.');
    if (git(['status', '--porcelain', '--untracked-files=no']))
      throw new Error(
        'Lokale Änderungen an versionierten Dateien; Update abgebrochen. Änderungen sichern oder verwerfen.',
      );
    run('git', ['-C', root, 'pull', '--ff-only']);
    // The pulled installer may contain new deployment steps, so it runs in a fresh process.
    const next = spawnSync(
      process.execPath,
      [fileURLToPath(import.meta.url), '--start', '--config', envFile],
      { cwd: root, stdio: 'inherit', windowsHide: true },
    );
    process.exit(next.status ?? 1);
  }
  run('pnpm', ['install', '--frozen-lockfile', '--prod=false']);
  run('pnpm', ['build']);
  run(process.execPath, [resolve(root, 'scripts/build-info.mjs'), commit]);
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
    // Keep the previous image for a manual rollback; absent on a first install.
    spawnSync('docker', ['tag', image, 'gitea-chatgpt-plugin:previous'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    // A failed build stops here and leaves the running container untouched.
    run('docker', ['compose', '--env-file', envFile, 'build'], dockerEnv);
    if (args.includes('--start')) {
      // Recreate unconditionally so a new image and changed .env values always take effect; volumes are kept.
      run(
        'docker',
        [
          'compose',
          '--env-file',
          envFile,
          'up',
          '-d',
          '--no-build',
          '--force-recreate',
          '--wait',
        ],
        dockerEnv,
      );
      verifyDeployment(dockerEnv, env, expected);
    } else
      console.log(
        'Hinweis: Image gebaut, der laufende Container wurde NICHT ersetzt. Aktivieren mit: node scripts/install.mjs --start',
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
