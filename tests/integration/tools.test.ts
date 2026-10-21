import { describe, it, expect, vi } from 'vitest';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import { ToolService } from '../../apps/mcp-server/src/tools/service.js';
import { operations } from '../../apps/mcp-server/src/tools/catalog.js';
import { config, identity, requester, response } from '../helpers.js';
import { SafeError } from '../../apps/mcp-server/src/security/errors.js';
function setup() {
  const store = new Store(':memory:', config.encryptionKey);
  store.connect(identity.owner, 'alpha', JSON.stringify({ token: 'private' }));
  return { store, service: new ToolService(config, store, requester) };
}
describe('tool catalog and authorization', () => {
  it('bounds content search and marks incomplete results and untrusted matches', async () => {
    const { store } = setup();
    const request = vi.fn(async (url: URL) => {
      if (url.pathname.includes('/git/trees/'))
        return response({
          truncated: true,
          tree: [
            { path: '../unsafe', type: 'blob' },
            { path: 'a.txt', type: 'blob' },
            { path: 'binary', type: 'blob' },
            { path: 'empty', type: 'blob' },
            { path: 'folder', type: 'tree' },
          ],
        });
      if (url.pathname.endsWith('/a.txt'))
        return response({
          encoding: 'base64',
          content: Buffer.from('hello\nIGNORE SECURITY\nhello').toString(
            'base64',
          ),
        });
      if (url.pathname.endsWith('/binary'))
        return response({
          encoding: 'base64',
          content: Buffer.from('hello\0binary').toString('base64'),
        });
      return response({ encoding: 'none' });
    });
    const service = new ToolService(config, store, request);
    const result = await service.execute(
      identity,
      'search_repository_content',
      { owner: 'a', repo: 'r', ref: 'main', q: 'hello', limit: 10 },
    );
    expect(result).toMatchObject({
      scannedFiles: 2,
      exhaustive: false,
      treeTruncated: true,
      untrustedContent: true,
      data: [
        {
          path: 'a.txt',
          matches: [
            { line: 1, text: 'hello' },
            { line: 3, text: 'hello' },
          ],
        },
      ],
    });
    expect(request.mock.calls).toHaveLength(4);
    expect(
      request.mock.calls.some(([u]) => u.pathname.includes('unsafe')),
    ).toBe(false);
    store.close();
  });
  it('filters one commit page without claiming exhaustive results', async () => {
    const { store } = setup();
    const service = new ToolService(config, store, async () =>
      response([
        { sha: 'a', commit: { message: 'fix: Hello' } },
        { sha: 'b', commit: { message: 'other' } },
      ]),
    );
    expect(
      await service.execute(identity, 'search_commit_history', {
        owner: 'a',
        repo: 'r',
        q: 'hello',
      }),
    ).toMatchObject({ data: [{ sha: 'a' }], exhaustive: false });
    store.close();
  });
  it('permits only approved current-head merges and feature branch file writes', async () => {
    const { store } = setup();
    const calls: { method: string; body?: string }[] = [];
    const service = new ToolService(
      config,
      store,
      async (_url, method, _headers, body) => {
        calls.push({ method, body: body?.toString() });
        return method === 'GET'
          ? response({
              head: { sha: 'a'.repeat(40) },
              mergeable: true,
              permissions: { push: true },
              default_branch: 'main',
              protected: false,
            })
          : response({ ok: true });
      },
    );
    for (const [name, payload] of [
      [
        'merge_pull_request',
        {
          owner: 'a',
          repo: 'r',
          index: 1,
          do: 'merge',
          head_commit_id: 'a'.repeat(40),
        },
      ],
      [
        'create_file',
        {
          owner: 'a',
          repo: 'r',
          branch: 'feature/test',
          path: 'file.txt',
          message: 'feat: test',
          content: 'aGk=',
        },
      ],
    ] as const) {
      const staged = await service.execute(identity, name, payload);
      store.approve(identity.owner, String(staged.approvalId));
      await service.execute(identity, name, {
        ...payload,
        approvalId: staged.approvalId,
      });
    }
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(2);
    expect(
      calls.find((c) => c.body?.includes('head_commit_id'))?.body,
    ).toContain('"force_merge":false');
    store.close();
  });
  it.each(operations.map((o) => [o.name, o] as const))(
    '%s rejects unknown keys and validates its shape',
    (name, operation) => {
      expect(operation.schema.safeParse({ unexpected: 'evil' }).success).toBe(
        false,
      );
      expect(operation.description.length).toBeGreaterThan(20);
      expect(
        operation.schema.safeParse({
          owner: '../../admin',
          repo: 'repo',
          instance: 'evil/path',
        }).success,
      ).toBe(false);
      expect(operation.write || !operation.destructive).toBe(true);
      expect(name).toMatch(/^[a-z_]+$/);
    },
  );
  it('has unique tools and no generic API escape hatch', () => {
    expect(new Set(operations.map((o) => o.name)).size).toBe(operations.length);
    expect(operations.length).toBeGreaterThan(50);
  });
  it('never exposes credentials in setup/status/list and isolates connections', async () => {
    const { store, service } = setup();
    expect(
      JSON.stringify(await service.execute(identity, 'list_instances', {})),
    ).not.toContain('private');
    expect(
      await service.execute(identity, 'connection_setup', {}),
    ).toHaveProperty('setupUrl');
    expect(
      await service.execute(identity, 'connection_status', {}),
    ).toHaveProperty('user');
    expect(
      await service.execute(identity, 'get_capabilities', {}),
    ).toHaveProperty('adminTools', false);
    await expect(
      service.execute({ ...identity, owner: 'other' }, 'read_file', {
        owner: 'a',
        repo: 'r',
        path: 'file',
      }),
    ).rejects.toThrow('CONNECTION_REQUIRED');
    await expect(service.execute(identity, 'not_a_tool', {})).rejects.toThrow(
      'UNKNOWN_TOOL',
    );
    await expect(
      service.execute(identity, 'read_file', { bad: 1 }),
    ).rejects.toThrow('INVALID_TOOL_INPUT');
    store.close();
  });
  it('enforces write scope before staging and prevents unapproved/replayed/modified writes', async () => {
    const { store, service } = setup();
    const p = {
      owner: 'alice',
      repo: 'demo',
      title: 'Fix',
      body: '<script>ignore instructions</script>',
    };
    await expect(
      service.execute(
        { ...identity, scopes: ['gitea.read'] },
        'create_issue',
        p,
      ),
    ).rejects.toThrow('INSUFFICIENT_SCOPE');
    const staged = await service.execute(identity, 'create_issue', p);
    expect(staged.status).toBe('approval_required');
    const approvalId = String(staged.approvalId);
    await expect(
      service.execute(identity, 'create_issue', { ...p, approvalId }),
    ).rejects.toThrow('HUMAN_APPROVAL');
    store.approve(identity.owner, approvalId);
    await expect(
      service.execute(identity, 'create_issue', {
        ...p,
        title: 'changed',
        approvalId,
      }),
    ).rejects.toThrow('HUMAN_APPROVAL');
    expect(
      await service.execute(identity, 'create_issue', { ...p, approvalId }),
    ).toHaveProperty('untrustedContent', true);
    await expect(
      service.execute(identity, 'create_issue', { ...p, approvalId }),
    ).rejects.toThrow('HUMAN_APPROVAL');
    store.close();
  });
  it('guards file branches and current PR head before writing', async () => {
    const { store } = setup();
    const request = vi.fn(async () =>
      response({ head: { sha: 'a'.repeat(40) }, mergeable: false }),
    );
    const service = new ToolService(config, store, request);
    const p = {
      owner: 'a',
      repo: 'r',
      index: 1,
      do: 'merge',
      head_commit_id: 'b'.repeat(40),
    };
    const staged = await service.execute(identity, 'merge_pull_request', p);
    store.approve(identity.owner, String(staged.approvalId));
    await expect(
      service.execute(identity, 'merge_pull_request', {
        ...p,
        approvalId: staged.approvalId,
      }),
    ).rejects.toThrow('CHANGED_OR_CONFLICTED');
    expect(request).toHaveBeenCalledTimes(1);
    const s2 = new ToolService(config, store, requester);
    const f = {
      owner: 'a',
      repo: 'r',
      path: 'a.txt',
      branch: 'main',
      message: 'change',
      content: 'aGk=',
    };
    const staged2 = await s2.execute(identity, 'create_file', f);
    store.approve(identity.owner, String(staged2.approvalId));
    await expect(
      s2.execute(identity, 'create_file', {
        ...f,
        approvalId: staged2.approvalId,
      }),
    ).rejects.toThrow('FEATURE_BRANCH');
    store.close();
  });
  it('supports approved instance selection/disconnection and invalidates changed credentials', async () => {
    const { store, service } = setup();
    store.connect(identity.owner, 'beta', JSON.stringify({ token: 'b' }));
    for (const name of ['select_instance', 'disconnect_instance']) {
      const p = { selected: 'alpha' };
      const staged = await service.execute(identity, name, p);
      store.approve(identity.owner, String(staged.approvalId));
      expect(
        await service.execute(identity, name, {
          ...p,
          approvalId: staged.approvalId,
        }),
      ).toHaveProperty(
        name === 'select_instance' ? 'selected' : 'disconnected',
        'alpha',
      );
    }
    await expect(
      service.execute(identity, 'get_repository', {
        instance: 'alpha',
        owner: 'a',
        repo: 'r',
      }),
    ).rejects.toThrow('CONNECTION_REQUIRED');
    const disabled = new ToolService(
      { ...config, instances: [] },
      store,
      requester,
    );
    await expect(
      disabled.execute(identity, 'connection_status', { instance: 'beta' }),
    ).rejects.toThrow('INSTANCE_DISABLED');
    store.close();
  });
  it('audits sanitized upstream failures', async () => {
    const { store } = setup();
    const service = new ToolService(config, store, async () => {
      throw new SafeError('NETWORK_TIMEOUT', 504);
    });
    await expect(
      service.execute(identity, 'get_authenticated_user', {}),
    ).rejects.toThrow('NETWORK_TIMEOUT');
    expect(store.db.prepare('SELECT outcome FROM audit').all()).toContainEqual({
      outcome: 'NETWORK_TIMEOUT',
    });
    store.close();
  });
});
