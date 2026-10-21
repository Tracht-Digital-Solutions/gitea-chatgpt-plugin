import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const name = 'gitea-chatgpt-e2e-' + randomBytes(5).toString('hex');
const network = name + '-net';
const runner = name + '-runner';
const runnerImage =
  'gitea/runner@sha256:f4db24cc5f682483ffd01b8de6a6c6d15e6fd9320a0ce27fd18d4398db421eae';
const image =
  'gitea/gitea@sha256:30777c91280d973fa02be48b1ade735bd6859e8f6f7af3b4444d519437852504';
const docker = (args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
try {
  docker(['network', 'create', '--internal', network]);
  docker([
    'run',
    '--detach',
    '--rm',
    '--name',
    name,
    '--network',
    'bridge',
    '-p',
    '127.0.0.1::3000',
    '-e',
    'GITEA__security__INSTALL_LOCK=true',
    '-e',
    'GITEA__database__DB_TYPE=sqlite3',
    '-e',
    'GITEA__service__DISABLE_REGISTRATION=true',
    '-e',
    'GITEA__server__ROOT_URL=http://gitea:3000/',
    image,
  ]);
  docker(['network', 'connect', '--alias', 'gitea', network, name]);
  const port = docker(['port', name, '3000/tcp']).split(':').at(-1)!;
  const url = 'http://127.0.0.1:' + port;
  let ready = false;
  for (let i = 0; i < 90; i++) {
    try {
      if ((await fetch(url + '/api/v1/version')).ok) {
        ready = true;
        break;
      }
    } catch {
      /* isolated server is starting */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('Isolated Gitea did not start');
  const version = (await (
    await fetch(url + '/api/v1/version')
  ).json()) as unknown;
  process.stdout.write('Isolated Gitea: ' + JSON.stringify(version) + '\n');
  docker([
    'exec',
    '--user',
    'git',
    name,
    'gitea',
    '--config',
    '/data/gitea/conf/app.ini',
    'admin',
    'user',
    'create',
    '--username',
    'e2e',
    '--password',
    randomBytes(24).toString('hex'),
    '--email',
    'e2e@example.invalid',
    '--must-change-password=false',
  ]);
  const token = docker([
    'exec',
    '--user',
    'git',
    name,
    'gitea',
    '--config',
    '/data/gitea/conf/app.ini',
    'admin',
    'user',
    'generate-access-token',
    '--username',
    'e2e',
    '--token-name',
    'integration',
    '--scopes',
    'write:user,write:repository,write:issue,write:organization,write:package',
    '--raw',
  ]);
  const runnerToken = docker([
    'exec',
    '--user',
    'git',
    name,
    'gitea',
    '--config',
    '/data/gitea/conf/app.ini',
    'actions',
    'generate-runner-token',
  ]);
  execFileSync(
    'docker',
    [
      'run',
      '--detach',
      '--rm',
      '--name',
      runner,
      '--network',
      network,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '-e',
      'GITEA_INSTANCE_URL=http://gitea:3000',
      '-e',
      'GITEA_RUNNER_REGISTRATION_TOKEN',
      '-e',
      'GITEA_RUNNER_NAME=mcp-isolated',
      '-e',
      'GITEA_RUNNER_LABELS=mcp-host:host',
      runnerImage,
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GITEA_RUNNER_REGISTRATION_TOKEN: runnerToken },
    },
  );
  process.stdout.write(
    'Isolated runner: pinned Gitea Runner 5.2.0, internal network, no host mounts or Docker socket.\n',
  );
  const result = spawnSync(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'tests/e2e/gitea.test.ts',
      'tests/e2e/publishing.test.ts',
      'tests/e2e/actions.test.ts',
      'tests/e2e/projects.test.ts',
      'tests/e2e/setup.test.ts',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, GITEA_E2E_URL: url, GITEA_E2E_TOKEN: token },
    },
  );
  if (result.status !== 0) process.exitCode = 1;
} finally {
  try {
    docker(['stop', runner]);
  } catch {
    /* May not have started. */
  }
  try {
    docker(['stop', name]);
  } catch {
    process.stderr.write('Container cleanup failed: ' + name + '\n');
  }
  try {
    docker(['network', 'rm', network]);
  } catch {
    process.stderr.write('Test network cleanup failed: ' + network + '\n');
  }
}
