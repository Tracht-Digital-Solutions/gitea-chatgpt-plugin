import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { operations } from '../../apps/mcp-server/src/tools/catalog.js';
import { registerManagementTools } from '../../apps/mcp-server/src/tools/management.js';
import { ToolService } from '../../apps/mcp-server/src/tools/service.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import { config, identity, response } from '../helpers.js';

const names = new Set<string>();
registerManagementTools((name) => {
  names.add(name);
});
const tools = operations.filter((o) => names.has(o.name));
const seed: Record<string, unknown> = {
  owner: 'alice',
  repo: 'demo',
  org: 'team',
  workflow: 'build.yml',
  run: 12,
  job: 13,
  ref: 'main',
  inputs: { environment: 'test' },
  project: 1,
  column: 2,
  column_id: 3,
  issue_id: 987,
  index: 4,
  title: 'In progress',
  color: '#aabbcc',
  column_ids: [2, 3],
  time: 3600,
  time_id: 5,
  created: '2026-10-21T08:00:00Z',
};
const argsFor = (op: (typeof tools)[number]) =>
  Object.fromEntries(
    Object.keys(op.schema.shape)
      .filter((k) => k in seed)
      .map((k) => [k, seed[k]]),
  );
type ApiOperation = {
  parameters?: { in: string; name: string }[];
  requestBody?: { content: Record<string, { schema: object }> };
};
const spec = JSON.parse(
  readFileSync('docs/research/gitea-openapi.json', 'utf8'),
) as {
  components: object;
  paths: Record<string, Record<string, ApiOperation>>;
};
const ajv = new Ajv2020({ strict: false });
addFormats.default(ajv);

describe('Actions, projects and time management', () => {
  it.each(tools.map((op) => [op.name, op] as const))(
    '%s matches the API and enforces approval, scope, tenant and replay protections',
    async (_name, op) => {
      const args = argsFor(op);
      const parsed = op.schema.parse(args);
      const request = op.request!(parsed);
      const contract = Object.entries(spec.paths).find(([path]) =>
        new RegExp('^' + path.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(
          request.path,
        ),
      )?.[1][(request.method ?? 'GET').toLowerCase()];
      expect(contract, request.path).toBeDefined();
      const allowedQueries =
        contract?.parameters
          ?.filter((p) => p.in === 'query')
          .map((p) => p.name) ?? [];
      for (const key of Object.keys(request.query ?? {}))
        expect(allowedQueries).toContain(key);
      if (request.body) {
        const schema =
          contract?.requestBody?.content['application/json']?.schema;
        expect(schema).toBeDefined();
        const validate = ajv.compile({
          components: spec.components,
          ...schema,
        });
        expect(validate(request.body), JSON.stringify(validate.errors)).toBe(
          true,
        );
      }
      const store = new Store(':memory:', config.encryptionKey);
      store.connect(
        identity.owner,
        'alpha',
        JSON.stringify({ token: 'fixture-token' }),
      );
      const calls: { path: string; method: string; body?: string }[] = [];
      const service = new ToolService(
        config,
        store,
        async (url, method, _headers, body) => {
          calls.push({ path: url.pathname, method, body });
          return response({ fixture: true });
        },
      );
      try {
        await expect(
          service.execute({ ...identity, owner: 'other-user' }, op.name, args),
        ).rejects.toThrow();
        expect(calls).toHaveLength(0);
        if (op.write) {
          await expect(
            service.execute(
              { ...identity, scopes: ['gitea.read'] },
              op.name,
              args,
            ),
          ).rejects.toThrow('INSUFFICIENT_SCOPE');
          const staged = await service.execute(identity, op.name, args);
          expect(staged.status).toBe('approval_required');
          expect(calls).toHaveLength(0);
          await expect(
            service.execute(identity, op.name, {
              ...args,
              approvalId: staged.approvalId,
            }),
          ).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
          store.approve(identity.owner, String(staged.approvalId));
          await expect(
            service.execute(identity, op.name, {
              ...args,
              instance: 'beta',
              approvalId: staged.approvalId,
            }),
          ).rejects.toThrow();
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
        expect(calls[0]).toMatchObject({
          path: '/api/v1' + request.path,
          method: request.method ?? 'GET',
        });
        if (request.body)
          expect(JSON.parse(calls[0]!.body!)).toEqual(request.body);
      } finally {
        store.close();
      }
    },
  );

  it.each([
    ['add_issue_time', { time: -60 }],
    ['add_issue_time', { time: 0 }],
    ['add_issue_time', { user_name: 'another-user' }],
    ['dispatch_action_workflow', { workflow: '../../admin' }],
    ['dispatch_action_workflow', { inputs: { secret: { nested: true } } }],
    ['reorder_project_columns', { column_ids: [2, 2] }],
    ['update_project_column', { sorting: 128 }],
    ['move_project_issue', { issue_id: 0 }],
    ['create_project', { template_type: 'unknown' }],
  ])('%s rejects unsafe or unsupported arguments %j', (name, extra) => {
    const op = tools.find((o) => o.name === name)!;
    expect(op.schema.safeParse({ ...argsFor(op), ...extra }).success).toBe(
      false,
    );
  });

  it('fails closed when an older instance does not expose project APIs', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(
      identity.owner,
      'alpha',
      JSON.stringify({ token: 'fixture-token' }),
    );
    try {
      const service = new ToolService(config, store, async () =>
        response({}, 404),
      );
      await expect(
        service.execute(identity, 'list_projects', {
          owner: 'alice',
          repo: 'demo',
        }),
      ).rejects.toThrow('GITEA_NOT_FOUND_OR_UNSUPPORTED');
    } finally {
      store.close();
    }
  });
});
