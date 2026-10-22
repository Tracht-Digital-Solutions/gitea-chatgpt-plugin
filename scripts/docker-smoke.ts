import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { request as httpRequest, type IncomingHttpHeaders } from 'node:http';
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
    'GITEA_INSTANCES=[]',
    process.env.DOCKER_TEST_IMAGE ?? 'gitea-chatgpt-plugin:dev',
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
  const probe = (path: string, method = 'GET') =>
    new Promise<{ status: number; headers: IncomingHttpHeaders; body: Buffer }>(
      (resolve, reject) => {
        const req = httpRequest(
          'http://127.0.0.1:' + port + path,
          {
            method,
            headers: { Host: 'mcp.example.org' },
            timeout: 5000,
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (chunk: Buffer) => chunks.push(chunk));
            res.on('end', () =>
              resolve({
                status: res.statusCode!,
                headers: res.headers,
                body: Buffer.concat(chunks),
              }),
            );
            res.on('error', reject);
          },
        );
        req.on('timeout', () => req.destroy(new Error('Probe timeout')));
        req.on('error', reject);
        req.end();
      },
    );
  docker([
    'exec',
    name,
    'node',
    '-e',
    "if(process.env.NODE_ENV!=='production'||process.getuid()===0)process.exit(1)",
  ]);
  const icon = await probe('/assets/icon.png');
  const png = icon.body;
  if (
    icon.status !== 200 ||
    icon.headers['content-type'] !== 'image/png' ||
    png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
    png.readUInt32BE(16) !== 512 ||
    png.readUInt32BE(20) !== 512
  )
    throw new Error(
      `Published branding unavailable: HTTP ${icon.status}, ${png.length} bytes`,
    );
  // The startup line goes to stderr and proves the loaded build and approval mode.
  const logs = spawnSync('docker', ['logs', name], { encoding: 'utf8' });
  if (
    !/Gitea MCP server ready: version=\S+ commit=\S+ writeApproval=disabled mode=production/.test(
      logs.stdout + logs.stderr,
    )
  )
    throw new Error('Startup summary with approval mode missing');
  docker([
    'exec',
    name,
    'node',
    '-e',
    "JSON.parse(require('fs').readFileSync('build-info.json','utf8'))",
  ]);
  const anonymous = await probe('/mcp', 'POST');
  if (anonymous.status !== 401)
    throw new Error('MCP must require authentication');
  const health = docker([
    'exec',
    name,
    'node',
    '-e',
    "fetch('http://127.0.0.1:3000/healthz').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())})",
  ]);
  process.stdout.write(
    'Docker production/non-root/read-only, branding and OAuth guard: ' +
      health +
      '\n',
  );
} finally {
  try {
    docker(['stop', name]);
  } catch {
    process.stderr.write('Container cleanup failed: ' + name + '\n');
  }
}
