import { expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../apps/mcp-server/src/app.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import type { Requester } from '../../apps/mcp-server/src/security/network.js';
import { config, identity } from '../helpers.js';

export async function realHarness(selfService = false) {
  const url = process.env.GITEA_E2E_URL,
    token = process.env.GITEA_E2E_TOKEN;
  if (!url?.startsWith('http://127.0.0.1:') || !token)
    throw Error('Disposable loopback Gitea required');
  const request: Requester = async (target, method, headers, body) => {
    if (selfService && target.hostname === 'auth.example.org')
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ access_token: 'fixture-access' }),
      };
    const result = await fetch(new URL(target.pathname + target.search, url), {
      method,
      headers,
      body: Buffer.isBuffer(body) ? new Uint8Array(body) : body,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    return {
      status: result.status,
      headers: Object.fromEntries(result.headers),
      body: await result.text(),
    };
  };
  const store = new Store(':memory:', config.encryptionKey);
  store.connect(identity.owner, 'alpha', JSON.stringify({ token }));
  const testConfig = { ...config, allowUserServers: selfService };
  const { app } = createApp(testConfig, store, {
    authenticate: async () => identity,
    request,
    ...(selfService ? { customRequest: request } : {}),
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('Missing port');
  testConfig.publicUrl = 'http://127.0.0.1:' + address.port;
  const client = new Client({ name: 'real-gitea-matrix', version: '1.0.0' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(testConfig.publicUrl + '/mcp'), {
      requestInit: { headers: { Authorization: 'Bearer fixture' } },
    }),
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return (result.structuredContent as { result: Record<string, unknown> })
      .result;
  };
  const approved = async (name: string, args: Record<string, unknown>) => {
    const staged = await call(name, args);
    expect(staged.status).toBe('approval_required');
    store.approve(identity.owner, String(staged.approvalId));
    return { ...args, approvalId: staged.approvalId };
  };
  return {
    app,
    store,
    testConfig,
    call,
    write: async (name: string, args: Record<string, unknown>) =>
      call(name, await approved(name, args)),
    deniedWrite: async (
      name: string,
      args: Record<string, unknown>,
      code: string,
    ) => {
      const result = await client.callTool({
        name,
        arguments: await approved(name, args),
      });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain(code);
    },
    close: async () => {
      await client.close();
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    },
  };
}
