import { describe, it, expect, vi } from 'vitest';
import { ToolService } from '../../apps/mcp-server/src/tools/service.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import { config, identity, response } from '../helpers.js';
describe('Gitea refresh token rotation', () => {
  it('serializes concurrent refreshes and invalidates earlier approval revisions', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(
      identity.owner,
      'beta',
      JSON.stringify({
        token: 'expired',
        refreshToken: 'refresh-secret',
        expiresAt: Date.now() - 1,
      }),
    );
    const revision = store.connection(identity.owner, 'beta', true).revision;
    const request = vi.fn(async (url: URL) =>
      url.pathname.endsWith('/access_token')
        ? response({
            access_token: 'fresh',
            refresh_token: 'rotated',
            expires_in: 3600,
          })
        : response({ login: 'alice' }),
    );
    const service = new ToolService(config, store, request);
    await Promise.all([
      service.execute(identity, 'get_authenticated_user', {}),
      service.execute(identity, 'get_authenticated_user', {}),
    ]);
    expect(
      request.mock.calls.filter(([u]) => u.pathname.endsWith('/access_token')),
    ).toHaveLength(1);
    expect(store.connection(identity.owner).token).toBe('fresh');
    expect(store.connection(identity.owner).refreshToken).toBe('rotated');
    expect(store.connection(identity.owner).revision).not.toBe(revision);
    store.close();
  });
  it.each([
    response({}, 401),
    response({ access_token: 'missing-refresh' }, 200),
  ])(
    'disconnects on rejected or malformed refresh responses',
    async (result) => {
      const store = new Store(':memory:', config.encryptionKey);
      store.connect(
        identity.owner,
        'beta',
        JSON.stringify({ token: 'old', refreshToken: 'r', expiresAt: 1 }),
      );
      const service = new ToolService(config, store, async () => result);
      await expect(
        service.execute(identity, 'get_authenticated_user', {}),
      ).rejects.toThrow('REFRESH_FAILED_RECONNECT');
      expect(store.list(identity.owner)).toEqual([]);
      store.close();
    },
  );
  it('never resurrects a connection disconnected during refresh', async () => {
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(
      identity.owner,
      'beta',
      JSON.stringify({ token: 'old', refreshToken: 'r', expiresAt: 1 }),
    );
    const service = new ToolService(config, store, async () => {
      store.disconnect(identity.owner, 'beta');
      return response({
        access_token: 'fresh',
        refresh_token: 'rotated',
        expires_in: 3600,
      });
    });
    await expect(
      service.execute(identity, 'get_authenticated_user', {}),
    ).rejects.toThrow('CONNECTION_REQUIRED');
    expect(store.list(identity.owner)).toEqual([]);
    store.close();
  });
});
