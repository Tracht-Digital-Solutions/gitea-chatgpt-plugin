import { describe, it, expect, vi } from 'vitest';
import { GiteaClient } from '../../apps/mcp-server/src/gitea/client.js';
import { response } from '../helpers.js';
describe('Gitea API client', () => {
  it('encodes queries, authenticates and reports bounded pagination', async () => {
    const request = vi.fn(async () =>
      response([{ name: 'repo' }], 200, {
        link: '<https://git.example.org/api/v1/user/repos?page=2>; rel="next"',
      }),
    );
    const c = new GiteaClient('https://git.example.org', 'private', request);
    const result = await c.call({
      path: '/user/repos',
      query: { page: 1, limit: 20, q: 'a & b', empty: undefined },
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, hasNext: true });
    expect(result.data).toEqual([{ name: 'repo' }]);
    expect(request.mock.calls[0]).toBeDefined();
  });
  it.each([
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [404, 'NOT_FOUND_OR_UNSUPPORTED'],
    [409, 'CONFLICT'],
    [422, 'VALIDATION'],
    [429, 'RATE_LIMITED'],
    [500, 'UPSTREAM_ERROR'],
    [302, 'UPSTREAM_ERROR'],
  ])('maps %i without leaking upstream bodies', async (status, code) => {
    const c = new GiteaClient('https://git.example.org', 'secret', async () =>
      response({ message: 'token=secret' }, status as number),
    );
    await expect(c.call({ path: '/user' })).rejects.toThrow(String(code));
  });
  it('retries an idempotent GET once, but never a mutation', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ ok: true }));
    const c = new GiteaClient('https://git.example.org', 'secret', request);
    expect((await c.call({ path: '/version' })).data).toEqual({ ok: true });
    expect(request).toHaveBeenCalledTimes(2);
    const write = vi.fn(async () => response({}, 503));
    await expect(
      new GiteaClient('https://git.example.org', 's', write).call({
        path: '/user/repos',
        method: 'POST',
        body: { name: 'x' },
      }),
    ).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
  });
  it('handles empty, invalid and text responses', async () => {
    expect(
      (
        await new GiteaClient('https://git.example.org', 's', async () => ({
          status: 204,
          headers: {},
          body: '',
        })).call({ path: '/x', method: 'DELETE' })
      ).data,
    ).toBeNull();
    const c = new GiteaClient('https://git.example.org', 's', async () => ({
      status: 200,
      headers: {},
      body: 'not JSON',
    }));
    await expect(c.call({ path: '/x' })).rejects.toThrow('INVALID_RESPONSE');
    expect((await c.call({ path: '/diff', text: true })).data).toBe('not JSON');
    for (const path of ['/../user', '//evil', '/x?q=x', '/x#fragment', 'x'])
      await expect(c.call({ path })).rejects.toThrow('INVALID_API_PATH');
  });
  it('requires push permissions, feature branch and known unprotected state', async () => {
    for (const [details, branch, error] of [
      [
        { permissions: { push: false }, default_branch: 'main' },
        { protected: false },
        'WRITE_DENIED',
      ],
      [
        { permissions: { push: true }, default_branch: 'feature' },
        { protected: false },
        'FEATURE_BRANCH',
      ],
      [
        { permissions: { push: true }, default_branch: 'main' },
        { protected: true },
        'PROTECTED',
      ],
      [
        { permissions: { push: true }, default_branch: 'main' },
        {},
        'PROTECTED',
      ],
    ] as const) {
      const c = new GiteaClient(
        'https://git.example.org',
        's',
        vi
          .fn()
          .mockResolvedValueOnce(response(details))
          .mockResolvedValueOnce(response(branch)),
      );
      await expect(c.assertFeatureBranch('a', 'r', 'feature')).rejects.toThrow(
        error,
      );
    }
    const c = new GiteaClient(
      'https://git.example.org',
      's',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({ permissions: { push: true }, default_branch: 'main' }),
        )
        .mockResolvedValueOnce(response({ protected: false })),
    );
    await expect(
      c.assertFeatureBranch('a', 'r', 'feature'),
    ).resolves.toBeUndefined();
  });
});
