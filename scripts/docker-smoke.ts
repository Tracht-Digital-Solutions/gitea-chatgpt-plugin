import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
const name = 'gitea-mcp-smoke-' + randomBytes(5).toString('hex');
const docker = (args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
try {
  docker([
    'run',
    '--detach',
    '--rm',
    '--read-only',
    '--tmpfs',
    '/app/data:uid=1000,gid=1000',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--name',
    name,
    '-p',
    '127.0.0.1::3000',
    '-e',
    'PUBLIC_URL=https://mcp.example.org',
    '-e',
    'OAUTH_ISSUER=https://auth.example.org',
    '-e',
    'OAUTH_AUDIENCE=https://mcp.example.org/mcp',
    '-e',
    'OAUTH_JWKS_URL=https://auth.example.org/jwks',
    '-e',
    'OAUTH_AUTHORIZATION_URL=https://auth.example.org/authorize',
    '-e',
    'OAUTH_TOKEN_URL=https://auth.example.org/token',
    '-e',
    'PORTAL_CLIENT_ID=portal',
    '-e',
    'ENCRYPTION_KEY=' + randomBytes(32).toString('hex'),
    '-e',
    'GITEA_INSTANCES=' +
      JSON.stringify([{ id: 'test', url: 'https://git.example.org' }]),
    'gitea-chatgpt-plugin:dev',
  ]);
  const port = docker(['port', name, '3000/tcp']).split(':').at(-1)!;
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try {
      const r = await fetch('http://127.0.0.1:' + port + '/healthz');
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {
      /* startup */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error('Docker health failed');
  const health = docker([
    'exec',
    name,
    'node',
    '-e',
    "fetch('http://127.0.0.1:3000/healthz').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())})",
  ]);
  process.stdout.write('Docker non-root/read-only health: ' + health + '\n');
} finally {
  try {
    docker(['stop', name]);
  } catch {
    process.stderr.write('Container cleanup failed: ' + name + '\n');
  }
}
