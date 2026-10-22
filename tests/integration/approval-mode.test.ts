import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../apps/mcp-server/src/app.js';
import {
  loadConfig,
  type Config,
} from '../../apps/mcp-server/src/config/index.js';
import { createMcpServer } from '../../apps/mcp-server/src/mcp/server.js';
import {
  loadBuildInfo,
  runtimeStatus,
  startupSummary,
  VERSION,
} from '../../apps/mcp-server/src/runtime.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import {
  describeOperation,
  operations,
} from '../../apps/mcp-server/src/tools/catalog.js';
import { ToolService } from '../../apps/mcp-server/src/tools/service.js';
import type { Requester } from '../../apps/mcp-server/src/security/network.js';
import { config, identity, response } from '../helpers.js';

const direct: Config = { ...config, requireWriteApproval: false };
const approval: Config = { ...config, requireWriteApproval: true };
const cases = [
  {
    name: 'create_issue',
    input: { owner: 'tds', repo: 'pms', title: 'Release-Qualität prüfen' },
    path: '/api/v1/repos/tds/pms/issues',
  },
  {
    name: 'create_project',
    input: {
      owner: 'tds',
      repo: 'pms',
      title: 'Release-Qualität',
      template_type: 'basic_kanban',
    },
    path: '/api/v1/repos/tds/pms/projects',
  },
] as const;

/** Mock Gitea: records every call and answers like a writable, unprotected repository. */
function gitea(overrides: Record<string, unknown> = {}) {
  const calls: { method: string; path: string; body?: string }[] = [];
  const request: Requester = vi.fn(async (url, method, _headers, body) => {
    calls.push({ method, path: url.pathname, body: body?.toString() });
    return response({
      id: 7,
      number: 7,
      title: 'created',
      permissions: { push: true },
      default_branch: 'main',
      protected: false,
      ...overrides,
    });
  });
  return {
    calls,
    request,
    writes: () => calls.filter((c) => c.method !== 'GET'),
  };
}
function setup(cfg: Config, overrides?: Record<string, unknown>) {
  const store = new Store(':memory:', cfg.encryptionKey);
  store.connect(
    identity.owner,
    'alpha',
    JSON.stringify({ token: 'gitea-pat' }),
  );
  const mock = gitea(overrides);
  const service = new ToolService(cfg, store, mock.request);
  const stage = vi.spyOn(store, 'stage');
  const consume = vi.spyOn(store, 'consume');
  const approvals = () => store.db.prepare('SELECT * FROM approvals').all();
  return { store, service, stage, consume, approvals, ...mock };
}
const env = {
  PUBLIC_URL: config.publicUrl,
  OAUTH_ISSUER: config.issuer,
  OAUTH_AUDIENCE: config.audience,
  OAUTH_JWKS_URL: config.jwksUrl,
  OAUTH_AUTHORIZATION_URL: config.authorizationUrl,
  OAUTH_TOKEN_URL: config.tokenUrl,
  PORTAL_CLIENT_ID: config.portalClientId,
  ENCRYPTION_KEY: config.encryptionKey.toString('hex'),
  GITEA_INSTANCES: JSON.stringify(config.instances),
};

describe('REQUIRE_WRITE_APPROVAL configuration', () => {
  it('loads true and false and defaults to direct writes when unset', () => {
    expect(
      loadConfig({ ...env, REQUIRE_WRITE_APPROVAL: 'true' })
        .requireWriteApproval,
    ).toBe(true);
    expect(
      loadConfig({ ...env, REQUIRE_WRITE_APPROVAL: 'false' })
        .requireWriteApproval,
    ).toBe(false);
    expect(loadConfig(env).requireWriteApproval).toBe(false);
  });
  it.each(['', 'TRUE', 'False', 'yes', '1', ' false', 'false # off'])(
    'refuses to start with the invalid value %j instead of guessing a mode',
    (value) => {
      expect(() =>
        loadConfig({ ...env, REQUIRE_WRITE_APPROVAL: value }),
      ).toThrow();
    },
  );
});

describe.each(cases)('$name with mocked Gitea', ({ name, input, path }) => {
  it('runs directly without staging or consuming approvals when disabled', async () => {
    const s = setup(direct);
    const result = await s.service.execute(identity, name, input);
    expect(result).not.toHaveProperty('status');
    expect(result).not.toHaveProperty('approvalId');
    expect(result).toMatchObject({ untrustedContent: true });
    expect(s.writes()).toEqual([
      expect.objectContaining({ method: 'POST', path }),
    ]);
    expect(s.stage).not.toHaveBeenCalled();
    expect(s.consume).not.toHaveBeenCalled();
    expect(s.approvals()).toEqual([]);
    expect(s.store.db.prepare('SELECT tool, outcome FROM audit').all()).toEqual(
      [{ tool: name, outcome: 'success' }],
    );
    s.store.close();
  });
  it('ignores a stale approvalId when disabled and still writes exactly once', async () => {
    const s = setup(direct);
    await s.service.execute(identity, name, {
      ...input,
      approvalId: 'a'.repeat(48),
    });
    expect(s.writes()).toHaveLength(1);
    expect(s.consume).not.toHaveBeenCalled();
    s.store.close();
  });
  it('stages, rejects invalid approvals and writes once after browser approval when enabled', async () => {
    const s = setup(approval);
    const staged = await s.service.execute(identity, name, input);
    expect(staged).toMatchObject({
      status: 'approval_required',
      approvalUrl: expect.stringMatching(
        /^https:\/\/mcp\.example\.org\/approvals\/[a-f0-9]{48}$/,
      ),
      expiresInSeconds: 600,
    });
    expect(s.calls).toEqual([]);
    const approvalId = String(staged.approvalId);
    for (const invalid of [
      { ...input, approvalId: 'b'.repeat(48) },
      { ...input, approvalId },
    ])
      await expect(s.service.execute(identity, name, invalid)).rejects.toThrow(
        'HUMAN_APPROVAL_REQUIRED',
      );
    s.store.approve(identity.owner, approvalId);
    await expect(
      s.service.execute({ ...identity, owner: 'other-user' }, name, {
        ...input,
        approvalId,
      }),
    ).rejects.toThrow('CONNECTION_REQUIRED');
    await expect(
      s.service.execute(identity, name, {
        ...input,
        title: 'Changed after approval',
        approvalId,
      }),
    ).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
    await s.service.execute(identity, name, { ...input, approvalId });
    await expect(
      s.service.execute(identity, name, { ...input, approvalId }),
    ).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
    expect(s.writes()).toEqual([
      expect.objectContaining({ method: 'POST', path }),
    ]);
    s.store.close();
  });
  it.each([direct, approval])(
    'denies missing OAuth write scope before any Gitea request (approval %#)',
    async (cfg) => {
      const s = setup(cfg);
      for (const scopes of [['gitea.read'], []])
        await expect(
          s.service.execute({ ...identity, scopes }, name, input),
        ).rejects.toThrow('INSUFFICIENT_SCOPE');
      expect(s.calls).toEqual([]);
      expect(s.stage).not.toHaveBeenCalled();
      s.store.close();
    },
  );
});

describe('security checks stay active without browser approval', () => {
  const file = {
    owner: 'a',
    repo: 'r',
    path: 'README.md',
    message: 'docs: update',
    content: 'aGk=',
  };
  it('refuses default and protected branches', async () => {
    for (const [branch, overrides, code] of [
      ['main', {}, 'FEATURE_BRANCH_REQUIRED'],
      ['feature/x', { protected: true }, 'PROTECTED_OR_UNKNOWN_BRANCH'],
      [
        'feature/x',
        { permissions: { push: false } },
        'REPOSITORY_WRITE_DENIED',
      ],
    ] as const) {
      const s = setup(direct, overrides);
      await expect(
        s.service.execute(identity, 'create_file', { ...file, branch }),
      ).rejects.toThrow(code);
      expect(s.writes()).toEqual([]);
      s.store.close();
    }
  });
  it('checks issue content version and current mergeable PR head', async () => {
    const s = setup(direct, {
      content_version: 2,
      head: { sha: 'a'.repeat(40) },
      mergeable: true,
    });
    await expect(
      s.service.execute(identity, 'update_issue', {
        owner: 'a',
        repo: 'r',
        index: 1,
        title: 'x',
        content_version: 1,
      }),
    ).rejects.toThrow('ISSUE_CHANGED_OR_VERSION_UNSUPPORTED');
    await expect(
      s.service.execute(identity, 'merge_pull_request', {
        owner: 'a',
        repo: 'r',
        index: 1,
        do: 'merge',
        head_commit_id: 'b'.repeat(40),
      }),
    ).rejects.toThrow('PULL_REQUEST_CHANGED_OR_CONFLICTED');
    expect(s.writes()).toEqual([]);
    s.store.close();
  });
  it('keeps the per-user rate limit', async () => {
    const s = setup(direct);
    let limited = false;
    for (let i = 0; i < 200 && !limited; i++)
      try {
        await s.service.execute(identity, 'get_runtime_status', {});
      } catch (error) {
        limited = String(error).includes('RATE_LIMITED');
      }
    expect(limited).toBe(true);
    s.store.close();
  });
});

describe('runtime diagnostics', () => {
  it('reports the effective mode of the running instance without secrets or a Gitea connection', async () => {
    for (const cfg of [direct, approval]) {
      const store = new Store(':memory:', cfg.encryptionKey);
      const request = vi.fn();
      const service = new ToolService(cfg, store, request);
      const status = await service.execute(identity, 'get_runtime_status', {});
      expect(status).toMatchObject({
        mcpVersion: VERSION,
        writeApprovalRequired: cfg.requireWriteApproval,
        approvalMode: cfg.requireWriteApproval ? 'browser_approval' : 'direct',
        configurationLoaded: true,
        toolCount: operations.length,
      });
      expect(status.buildCommit).toMatch(/^([0-9a-f]{7,40}(-dirty)?|unknown)$/);
      const text = JSON.stringify(status);
      for (const secret of [
        cfg.encryptionKey.toString('hex'),
        'test-client-secret',
        'gitea-client',
        'gitea-pat',
      ])
        expect(text).not.toContain(secret);
      expect(request).not.toHaveBeenCalled();
      await expect(
        service.execute({ ...identity, scopes: [] }, 'get_runtime_status', {}),
      ).rejects.toThrow('INSUFFICIENT_SCOPE');
      store.close();
    }
  });
  it('reads the embedded build commit and reports missing or forged build info as unknown', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'gitea-build-info-'));
    try {
      const file = resolve(dir, 'build-info.json');
      const sha = 'c'.repeat(40);
      writeFileSync(
        file,
        JSON.stringify({
          version: '0.4.0',
          commit: sha,
          builtAt: '2026-10-22T12:00:00.000Z',
        }),
      );
      const build = loadBuildInfo(file);
      expect(build.commit).toBe(sha);
      expect(
        runtimeStatus(direct, build, { NODE_ENV: 'production' }),
      ).toMatchObject({
        buildCommit: sha,
        builtAt: '2026-10-22T12:00:00.000Z',
        deploymentMode: 'production',
      });
      expect(startupSummary(direct, build, { NODE_ENV: 'production' })).toBe(
        'Gitea MCP server ready: version=' +
          VERSION +
          ' commit=' +
          sha +
          ' writeApproval=disabled mode=production',
      );
      expect(startupSummary(approval, build, {})).toContain(
        'writeApproval=required mode=development',
      );
      writeFileSync(
        file,
        JSON.stringify({ commit: '$(id)', version: 'x', builtAt: null }),
      );
      expect(loadBuildInfo(file).commit).toBe('unknown');
      expect(loadBuildInfo(resolve(dir, 'missing.json'))).toEqual({
        version: VERSION,
        commit: 'unknown',
        builtAt: null,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('MCP tool metadata follows the active mode', () => {
  const stale =
    /approval_required|approvalId|after (explicit |exact )?(browser )?approval|before approval|approved current head|browser approval (is|are) required/i;
  async function list(cfg: Config) {
    const store = new Store(':memory:', cfg.encryptionKey);
    store.connect(
      identity.owner,
      'alpha',
      JSON.stringify({ token: 'gitea-pat' }),
    );
    const testConfig = { ...cfg };
    const { calls, request } = gitea();
    const { app } = createApp(testConfig, store, {
      authenticate: async () => identity,
      request,
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    testConfig.publicUrl = 'http://127.0.0.1:' + address.port;
    const client = new Client({ name: 'mode-test', version: '1.0.0' });
    await client.connect(
      new StreamableHTTPClientTransport(
        new URL(testConfig.publicUrl + '/mcp'),
        {
          requestInit: { headers: { Authorization: 'Bearer token' } },
        },
      ),
    );
    const close = async () => {
      await client.close();
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
      store.close();
    };
    return { client, close, calls, tools: (await client.listTools()).tools };
  }
  it('advertises direct writes without approval wording or approvalId and executes create_project directly', async () => {
    const { client, close, calls, tools } = await list(direct);
    try {
      expect(tools.map((t) => t.name)).toContain('get_runtime_status');
      for (const tool of tools) {
        const op = operations.find((o) => o.name === tool.name)!;
        expect(tool.description).toBe(describeOperation(op, false));
        expect(tool.description).not.toMatch(stale);
        expect(tool.inputSchema.properties ?? {}).not.toHaveProperty(
          'approvalId',
        );
        if (op.write)
          expect(tool.description).toMatch(
            /Runs immediately without browser approval/,
          );
      }
      const result = await client.callTool({
        name: 'create_project',
        arguments: cases[1].input,
      });
      expect(JSON.stringify(result)).not.toContain('approval_required');
      expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
      const status = await client.callTool({
        name: 'get_runtime_status',
        arguments: {},
      });
      expect(status.structuredContent).toMatchObject({
        result: { writeApprovalRequired: false, approvalMode: 'direct' },
      });
    } finally {
      await close();
    }
  });
  it('advertises the approval flow and approvalId when enabled', async () => {
    const { client, close, calls, tools } = await list(approval);
    try {
      for (const tool of tools) {
        const op = operations.find((o) => o.name === tool.name)!;
        expect(tool.description).toBe(describeOperation(op, true));
        if (op.write) {
          expect(tool.description).toMatch(/Browser approval is required/);
          expect(tool.inputSchema.properties).toHaveProperty('approvalId');
        } else
          expect(tool.description).not.toMatch(
            /approval_required|approvalId|approval is required/i,
          );
      }
      const result = await client.callTool({
        name: 'create_issue',
        arguments: cases[0].input,
      });
      expect(JSON.stringify(result)).toContain('approval_required');
      expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
    } finally {
      await close();
    }
  });
  it('registers the same descriptions with registerTool as tools/list returns', () => {
    for (const cfg of [direct, approval]) {
      const store = new Store(':memory:', cfg.encryptionKey);
      const server = createMcpServer(
        new ToolService(cfg, store, vi.fn()),
        identity,
      );
      const registered = (
        server as unknown as {
          _registeredTools: Record<string, { description?: string }>;
        }
      )._registeredTools;
      for (const op of operations)
        expect(registered[op.name]?.description).toBe(
          describeOperation(op, cfg.requireWriteApproval),
        );
      store.close();
    }
  });
});
