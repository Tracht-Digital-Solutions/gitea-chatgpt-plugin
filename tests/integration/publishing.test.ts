import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { operations } from '../../apps/mcp-server/src/tools/catalog.js';
import { registerPublishingTools } from '../../apps/mcp-server/src/tools/publishing.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import { ToolService } from '../../apps/mcp-server/src/tools/service.js';
import { GiteaClient } from '../../apps/mcp-server/src/gitea/client.js';
import { config, identity, response } from '../helpers.js';
import { instanceSchema } from '../../apps/mcp-server/src/config/index.js';
const names = new Set<string>();
registerPublishingTools((n) => {
  names.add(n);
});
const tools = operations.filter((o) => names.has(o.name));
const seed: Record<string, unknown> = {
  owner: 'alice',
  org: 'team',
  repo: 'demo',
  username: 'neworg',
  name: 'package',
  type: 'generic',
  version: '1.0.0',
  file_name: 'sample.bin',
  content_base64: 'AP+A',
  title: 'Title',
  page_name: 'Home',
  index: 1,
  id: 2,
  due_date: '2026-11-01T00:00:00Z',
  position: 0,
  dependency_owner: 'alice',
  dependency_repo: 'demo',
  dependency_index: 2,
};
describe('publishing and issue metadata tools', () => {
  it.each([undefined, 2, 3])(
    'checks issue version %s before any mutation',
    async (version) => {
      const store = new Store(':memory:', config.encryptionKey);
      store.connect(
        identity.owner,
        'alpha',
        JSON.stringify({ token: 'fixture' }),
      );
      const methods: string[] = [];
      const service = new ToolService(config, store, async (_u, method) => {
        methods.push(method);
        return response({ content_version: version });
      });
      try {
        const args = {
          owner: 'alice',
          repo: 'demo',
          index: 1,
          title: 'Edited',
          content_version: 3,
        };
        const staged = await service.execute(identity, 'update_issue', args);
        store.approve(identity.owner, String(staged.approvalId));
        const execution = service.execute(identity, 'update_issue', {
          ...args,
          approvalId: staged.approvalId,
        });
        if (version === 3) {
          await execution;
          expect(methods).toEqual(['GET', 'PATCH']);
        } else {
          await expect(execution).rejects.toThrow(
            'ISSUE_CHANGED_OR_VERSION_UNSUPPORTED',
          );
          expect(methods).toEqual(['GET']);
        }
      } finally {
        store.close();
      }
    },
  );
  it('allows explicit narrow OAuth scopes and rejects admin/all scopes or missing identity access', () => {
    const instance = { id: 'alpha', url: 'https://git.example.org' };
    expect(
      instanceSchema.safeParse({
        ...instance,
        oauthScopes: ['read:user', 'write:organization', 'write:package'],
      }).success,
    ).toBe(true);
    for (const oauthScopes of [
      ['all'],
      ['read:user', 'write:admin'],
      ['write:package'],
      ['read:user', 'read:user'],
    ])
      expect(
        instanceSchema.safeParse({ ...instance, oauthScopes }).success,
      ).toBe(false);
  });
  it.each(tools.map((o) => [o.name, o] as const))(
    '%s authorizes exact writes and forwards the correct transport',
    async (_name, op) => {
      const args = Object.fromEntries(
        Object.keys(op.schema.shape)
          .filter((k) => k in seed)
          .map((k) => [k, seed[k]]),
      );
      const parsed = op.schema.parse(args);
      const req = op.request!(parsed);
      const store = new Store(':memory:', config.encryptionKey);
      store.connect(
        identity.owner,
        'alpha',
        JSON.stringify({ token: 'fixture' }),
      );
      const calls: {
        url: URL;
        method: string;
        headers: Record<string, string>;
        body?: string | Buffer;
      }[] = [];
      const service = new ToolService(
        config,
        store,
        async (url, method, headers, body) => {
          calls.push({ url, method, headers, body });
          return response({ ok: true });
        },
      );
      try {
        await expect(
          service.execute({ ...identity, owner: 'another' }, op.name, args),
        ).rejects.toThrow();
        if (op.write) {
          await expect(
            service.execute(
              { ...identity, scopes: ['gitea.read'] },
              op.name,
              args,
            ),
          ).rejects.toThrow('INSUFFICIENT_SCOPE');
          const staged = await service.execute(identity, op.name, args);
          expect(calls).toHaveLength(0);
          await expect(
            service.execute(identity, op.name, {
              ...args,
              approvalId: staged.approvalId,
            }),
          ).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
          store.approve(identity.owner, String(staged.approvalId));
          await service.execute(identity, op.name, {
            ...args,
            approvalId: staged.approvalId,
          });
          await expect(
            service.execute(identity, op.name, {
              ...args,
              approvalId: staged.approvalId,
            }),
          ).rejects.toThrow();
        } else await service.execute(identity, op.name, args);
        expect(calls).toHaveLength(1);
        const actual = calls[0]!;
        expect(actual.url.pathname).toBe(
          (req.registry ? '/api/packages' : '/api/v1') + req.path,
        );
        expect(actual.method).toBe(req.method ?? 'GET');
        if (req.registry) {
          expect(actual.headers['Content-Type']).toBe(
            'application/octet-stream',
          );
          expect(actual.body).toEqual(Buffer.from([0, 255, 128]));
        } else if (req.body)
          expect(JSON.parse(String(actual.body))).toEqual(req.body);
      } finally {
        store.close();
      }
    },
  );
  const api = JSON.parse(
    readFileSync('docs/research/gitea-openapi.json', 'utf8'),
  ) as {
    components: {
      schemas: Record<string, { properties: Record<string, unknown> }>;
    };
  };
  it.each([
    ['create_issue', 'CreateIssueOption'],
    ['update_issue', 'EditIssueOption'],
    ['create_repository', 'CreateRepoOption'],
    ['create_organization_repository', 'CreateRepoOption'],
    ['create_organization', 'CreateOrgOption'],
    ['create_release', 'CreateReleaseOption'],
    ['update_release', 'EditReleaseOption'],
    ['create_milestone', 'CreateMilestoneOption'],
    ['update_milestone', 'EditMilestoneOption'],
    ['create_wiki_page', 'CreateWikiPageOptions'],
    ['update_wiki_page', 'CreateWikiPageOptions'],
    ['create_project', 'CreateProjectOption'],
    ['update_project', 'EditProjectOption'],
  ])('%s exposes every documented %s property', (tool, schema) => {
    const shape = operations.find((o) => o.name === tool)!.schema.shape;
    for (const field of Object.keys(api.components.schemas[schema]!.properties))
      expect(shape, field).toHaveProperty(field);
  });
  it('preserves clearing values and forwards every issue edit field', () => {
    const op = operations.find((o) => o.name === 'update_issue')!;
    const fields = {
      title: 'Updated',
      body: '',
      assignee: 'alice',
      assignees: [],
      milestone: 0,
      projects: [],
      ref: '',
      due_date: '2026-11-01T00:00:00Z',
      state: 'open',
      content_version: 3,
      unset_due_date: false,
    };
    expect(
      op.request!(
        op.schema.parse({ owner: 'alice', repo: 'demo', index: 1, ...fields }),
      ).body,
    ).toEqual(fields);
  });
  it('restricts raw binary requests to bounded generic registry uploads', async () => {
    let calls = 0;
    const client = new GiteaClient(
      'https://git.example.org',
      'fixture',
      async () => {
        calls++;
        return response({});
      },
    );
    for (const request of [
      { path: '/user', rawBody: Buffer.from('x') },
      {
        path: '/alice/generic/p/1/f',
        method: 'POST' as const,
        registry: 'generic-upload' as const,
        rawBody: Buffer.from('x'),
      },
      {
        path: '/alice/npm/p/1/f',
        method: 'PUT' as const,
        registry: 'generic-upload' as const,
        rawBody: Buffer.from('x'),
      },
      {
        path: '/alice/generic/p/1/f',
        method: 'PUT' as const,
        registry: 'generic-upload' as const,
        rawBody: Buffer.alloc(750001),
      },
    ])
      await expect(client.call(request)).rejects.toThrow(
        'INVALID_REGISTRY_REQUEST',
      );
    expect(calls).toBe(0);
  });
});
