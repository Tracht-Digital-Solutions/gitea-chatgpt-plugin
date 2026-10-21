import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import supertest from 'supertest';
import { createApp } from '../../apps/mcp-server/src/app.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import { SafeError } from '../../apps/mcp-server/src/security/errors.js';
import { config, identity, requester, response } from '../helpers.js';
import { operations } from '../../apps/mcp-server/src/tools/catalog.js';
describe('Streamable HTTP MCP', () => {
  it('directs expired Gitea credentials to the portal without challenging the valid MCP identity', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(
      identity.owner,
      'alpha',
      JSON.stringify({ token: 'expired-gitea-token' }),
    );
    const { app } = createApp(config, store, {
      authenticate: async () => identity,
      request: async () =>
        response({ message: 'private upstream detail' }, 401),
    });
    const call = await supertest(app)
      .post('/mcp')
      .set('Host', 'mcp.example.org')
      .set('Authorization', 'Bearer valid-mcp-token')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'get_authenticated_user', arguments: {} },
      });
    expect(call.body.result.isError).toBe(true);
    expect(call.body.result._meta).toBeUndefined();
    expect(JSON.stringify(call.body.result.content)).toContain(
      'https://mcp.example.org/portal',
    );
    expect(JSON.stringify(call.body)).not.toContain('private upstream detail');
    store.close();
  });
  it('starts, authenticates, initializes, lists typed tools and calls through the SDK client', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(
      identity.owner,
      'alpha',
      JSON.stringify({ token: 'gitea-token' }),
    );
    const testConfig = { ...config };
    const { app } = createApp(testConfig, store, {
      authenticate: async (token) => {
        if (token !== 'test-access')
          throw new SafeError('INVALID_ACCESS_TOKEN', 401);
        return identity;
      },
      request: requester,
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('No port');
    testConfig.publicUrl = 'http://127.0.0.1:' + address.port;
    const transport = new StreamableHTTPClientTransport(
      new URL(testConfig.publicUrl + '/mcp'),
      { requestInit: { headers: { Authorization: 'Bearer test-access' } } },
    );
    const client = new Client({ name: 'integration-test', version: '1.0.0' });
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(operations.length);
      for (const tool of tools.tools) {
        expect(tool.annotations).toHaveProperty('readOnlyHint');
        expect(tool.annotations).toHaveProperty('destructiveHint');
        expect(tool.annotations).toHaveProperty('openWorldHint', true);
        expect(tool.inputSchema.type).toBe('object');
        expect(tool._meta).toHaveProperty('securitySchemes');
      }
      const result = await client.callTool({
        name: 'get_authenticated_user',
        arguments: {},
      });
      expect(result.isError).not.toBe(true);
      expect(JSON.stringify(result)).toContain('alice');
      const stage = await client.callTool({
        name: 'create_issue',
        arguments: { owner: 'a', repo: 'r', title: 'Test' },
      });
      expect(JSON.stringify(stage)).toContain('approval_required');
      const invalid = await client.callTool({
        name: 'read_file',
        arguments: { owner: 'a', repo: 'r', path: '../private' },
      });
      expect(invalid.isError).toBe(true);
    } finally {
      await client.close();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      store.close();
    }
  });
  it('protects discovery, host, origins, methods and bearer validation', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    const { app } = createApp(config, store, {
      authenticate: async () => {
        throw new Error('secret');
      },
      request: requester,
    });
    expect((await supertest(app).get('/healthz')).body).toEqual({
      status: 'ok',
    });
    const discovery = await supertest(app)
      .get('/.well-known/oauth-protected-resource/mcp')
      .set('Host', 'mcp.example.org');
    expect(discovery.body.resource).toBe(config.audience);
    expect(
      (await supertest(app).post('/mcp').set('Host', 'evil.example')).status,
    ).toBe(403);
    expect(
      (
        await supertest(app)
          .post('/mcp')
          .set('Host', 'mcp.example.org')
          .set('Origin', 'https://evil.example')
      ).status,
    ).toBe(403);
    const missing = await supertest(app)
      .post('/mcp')
      .set('Host', 'mcp.example.org')
      .send({});
    expect(missing.status).toBe(401);
    expect(missing.headers['www-authenticate']).toContain('resource_metadata');
    const invalid = await supertest(app)
      .post('/mcp')
      .set('Host', 'mcp.example.org')
      .set('Authorization', 'Bearer bad')
      .send({});
    expect(invalid.status).toBe(401);
    expect(invalid.text).not.toContain('secret');
    expect(
      (await supertest(app).get('/mcp').set('Host', 'mcp.example.org')).status,
    ).toBe(405);
    store.close();
  });
  it('returns tool-level OAuth challenges for insufficient scopes', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    const { app } = createApp(config, store, {
      authenticate: async () => ({ ...identity, scopes: [] }),
      request: requester,
    });
    const call = await supertest(app)
      .post('/mcp')
      .set('Host', 'mcp.example.org')
      .set('Authorization', 'Bearer test')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'list_instances', arguments: {} },
      });
    expect(call.body.result._meta['mcp/www_authenticate'][0]).toContain(
      'insufficient_scope',
    );
    store.close();
  });
});
