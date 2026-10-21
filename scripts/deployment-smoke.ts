import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, sep } from 'node:path';
import { unzipSync } from 'fflate';

const version = (
  JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
).version;
const project = 'gitea-deployment-test-' + randomBytes(6).toString('hex');
const tempRoot = resolve(tmpdir());
const directory = mkdtempSync(resolve(tempRoot, project));
if (!directory.startsWith(tempRoot + sep) || !directory.includes(project))
  throw new Error('Unsafe cleanup directory');
const run = (args: string[]) =>
  execFileSync('docker', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90000,
  }).trim();
let started = false;
try {
  const entries = unzipSync(
    readFileSync(`artifacts/gitea-deployment-${version}.zip`),
  );
  for (const [path, bytes] of Object.entries(entries)) {
    const target = resolve(directory, path);
    if (!target.startsWith(directory + sep))
      throw new Error('Unsafe deployment path');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
  }
  writeFileSync(
    resolve(directory, '.env'),
    readFileSync(resolve(directory, '.env.example'), 'utf8').replace(
      'ENCRYPTION_KEY=',
      'ENCRYPTION_KEY=' + randomBytes(32).toString('hex'),
    ),
  );
  const model = JSON.parse(
    run(['compose', '-p', project, 'config', '--format', 'json']),
  ) as {
    name: string;
    services: {
      mcp: {
        image: string;
        build?: unknown;
        read_only: boolean;
        init: boolean;
        environment: Record<string, string>;
        ports: { host_ip: string; published: string }[];
      };
    };
  };
  const service = model.services.mcp;
  if (
    service.image !== `ghcr.io/jtracht/gitea-chatgpt-plugin:v${version}` ||
    service.build ||
    service.environment.NODE_ENV !== 'production' ||
    !service.read_only ||
    !service.init ||
    service.ports[0]?.host_ip !== '127.0.0.1'
  )
    throw new Error('Unsafe production Compose');
  service.image = process.env.DOCKER_TEST_IMAGE ?? service.image;
  service.ports[0]!.published = '0';
  writeFileSync(resolve(directory, 'runtime.json'), JSON.stringify(model));
  started = true;
  run([
    'compose',
    '-p',
    project,
    '-f',
    'runtime.json',
    'up',
    '-d',
    '--no-build',
    '--pull',
    'never',
    '--wait',
    '--wait-timeout',
    '60',
  ]);
  const port = run([
    'compose',
    '-p',
    project,
    '-f',
    'runtime.json',
    'port',
    'mcp',
    '3000',
  ])
    .split(':')
    .at(-1)!;
  const health = await fetch('http://127.0.0.1:' + port + '/healthz');
  if (!health.ok) throw new Error('Deployment ZIP health failed');
  process.stdout.write(
    'Extracted production ZIP: version-pinned Compose, persistent volume and healthy service verified.\n',
  );
} finally {
  if (started)
    run(['compose', '-p', project, '-f', 'runtime.json', 'down', '--volumes']);
  rmSync(directory, { recursive: true, force: true });
}
