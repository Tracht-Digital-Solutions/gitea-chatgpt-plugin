import { execFileSync, spawnSync } from 'node:child_process';
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
const run = (args: string[], env: NodeJS.ProcessEnv = process.env) =>
  execFileSync('docker', args, {
    cwd: directory,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 180000,
  }).trim();
const compose = (args: string[]) =>
  run(['compose', '-p', project, '-f', 'runtime.json', ...args]);
type Model = {
  name: string;
  services: {
    mcp: {
      image: string;
      build?: unknown;
      pull_policy?: string;
      read_only: boolean;
      init: boolean;
      environment: Record<string, string>;
      ports: { host_ip: string; published: string }[];
    };
  };
};
// Render Compose like an operator after editing .env; build args come from the environment.
const render = (commit: string) => {
  const model = JSON.parse(
    run(['compose', '-p', project, 'config', '--format', 'json'], {
      ...process.env,
      BUILD_COMMIT: commit,
    }),
  ) as Model;
  const service = model.services.mcp;
  if (
    service.image !== 'gitea-chatgpt-plugin:local' ||
    !service.build ||
    service.pull_policy !== 'build' ||
    service.environment.NODE_ENV !== 'production' ||
    !service.read_only ||
    !service.init ||
    service.ports[0]?.host_ip !== '127.0.0.1'
  )
    throw new Error('Unsafe production Compose');
  service.image = process.env.DOCKER_TEST_IMAGE ?? service.image;
  service.ports[0]!.published = '0';
  writeFileSync(resolve(directory, 'runtime.json'), JSON.stringify(model));
};
let started = false;
// Same steps as install.mjs --start: build first, then always recreate and wait for health.
const deploy = () => {
  compose(['build', 'mcp']);
  started = true;
  compose([
    'up',
    '-d',
    '--no-build',
    '--force-recreate',
    '--pull',
    'never',
    '--wait',
    '--wait-timeout',
    '60',
  ]);
  const id = compose(['ps', '-q', 'mcp']);
  // The startup line is written to stderr.
  const logs = spawnSync('docker', ['logs', id], { encoding: 'utf8' });
  return {
    id,
    commit: (
      JSON.parse(compose(['exec', '-T', 'mcp', 'cat', 'build-info.json'])) as {
        commit: string;
      }
    ).commit,
    revision: run([
      'inspect',
      '--format',
      '{{index .Config.Labels "org.opencontainers.image.revision"}}',
      id,
    ]),
    approval: /writeApproval=(required|disabled)/.exec(
      logs.stdout + logs.stderr,
    )?.[1],
  };
};
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
  const envPath = resolve(directory, '.env');
  writeFileSync(
    envPath,
    readFileSync(resolve(directory, '.env.example'), 'utf8')
      .replaceAll('example.org', 'install.test')
      .replace(
        'GITEA_INSTANCES=[]',
        'GITEA_INSTANCES=[{"id":"own","url":"https://git.install.test"}]',
      )
      .replace(
        'ENCRYPTION_KEY=',
        'ENCRYPTION_KEY=' + randomBytes(32).toString('hex'),
      ),
  );
  execFileSync(process.execPath, ['scripts/install.mjs', '--check'], {
    cwd: directory,
    stdio: 'pipe',
  });
  const firstCommit = 'a'.repeat(40);
  render(firstCommit);
  const first = deploy();
  const port = compose(['port', 'mcp', '3000']).split(':').at(-1)!;
  const health = await fetch('http://127.0.0.1:' + port + '/healthz');
  if (!health.ok) throw new Error('Deployment ZIP health failed');
  if (
    first.commit !== firstCommit ||
    first.revision !== firstCommit ||
    first.approval !== 'disabled'
  )
    throw new Error('Build commit or approval mode not applied');
  compose([
    'exec',
    '-T',
    'mcp',
    'node',
    '-e',
    "require('fs').writeFileSync('/app/data/persist-check','1')",
  ]);
  // Update: a new commit and REQUIRE_WRITE_APPROVAL=true must replace the container and keep the volume.
  writeFileSync(
    envPath,
    readFileSync(envPath, 'utf8').replace(
      'REQUIRE_WRITE_APPROVAL=false',
      'REQUIRE_WRITE_APPROVAL=true',
    ),
  );
  const secondCommit = 'b'.repeat(40);
  render(secondCommit);
  const second = deploy();
  if (
    second.id === first.id ||
    second.commit !== secondCommit ||
    second.revision !== secondCommit ||
    second.approval !== 'required'
  )
    throw new Error('Update did not replace the container with the new build');
  compose([
    'exec',
    '-T',
    'mcp',
    'node',
    '-e',
    "require('fs').accessSync('/app/data/persist-check')",
  ]);
  process.stdout.write(
    'Extracted source ZIP: local production build, .env settings, build commit, approval mode, container replacement on update, persistent volume and healthy service verified.\n',
  );
} finally {
  if (started) compose(['down', '--volumes']);
  rmSync(directory, { recursive: true, force: true });
}
