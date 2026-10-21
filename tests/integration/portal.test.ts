import { describe, it, expect, vi, afterEach } from 'vitest';
import supertest from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../apps/mcp-server/src/app.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import type { Requester } from '../../apps/mcp-server/src/security/network.js';
import { config, identity, response } from '../helpers.js';
afterEach(() => vi.useRealTimers());
const host = (app: Express) => ({
  get: (path: string) =>
    supertest(app).get(path).set('Host', 'mcp.example.org'),
  post: (path: string) =>
    supertest(app)
      .post(path)
      .set('Host', 'mcp.example.org')
      .set('Origin', config.publicUrl),
});
function setup(request?: Requester) {
  const store = new Store(':memory:', config.encryptionKey);
  const result = createApp(config, store, {
    authenticate: async () => identity,
    request:
      request ??
      (async (url) =>
        url.hostname === 'auth.example.org'
          ? response({ access_token: 'test-access' })
          : url.pathname.endsWith('/login/oauth/access_token')
            ? response({ access_token: 'gitea-access-token', expires_in: 3600 })
            : response({ login: 'alice' })),
  });
  return { store, app: result.app, h: host(result.app) };
}
async function login(h: ReturnType<typeof host>) {
  const start = await h.get('/login');
  const redirect = new URL(String(start.headers.location));
  const state = redirect.searchParams.get('state')!;
  expect(redirect.searchParams.get('code_challenge_method')).toBe('S256');
  const callback = await h
    .get('/callback?state=' + state + '&code=code')
    .set('Cookie', '__Host-gitea-login=' + state);
  expect(callback.status).toBe(302);
  const cookies = callback.headers['set-cookie'] as unknown as string[];
  const sid = cookies
    .find((c) => c.startsWith('__Host-gitea-session='))!
    .split(';')[0]!;
  expect(cookies.join(';')).toContain('HttpOnly');
  expect(cookies.join(';')).toContain('Secure');
  const portal = await h.get('/portal').set('Cookie', sid);
  const csrf = portal.text.match(/name="csrf" value="([^"]+)"/)![1]!;
  return { sid, csrf };
}
describe('secure browser setup and independent approvals', () => {
  it('requires browser login and rejects missing, mismatched, reused OAuth state', async () => {
    const { h, store } = setup();
    expect((await h.get('/portal')).headers.location).toBe('/login');
    expect((await h.get('/approvals/' + 'a'.repeat(48))).headers.location).toBe(
      '/login',
    );
    expect((await h.post('/connections').send({})).status).toBe(401);
    const begin = await h.get('/login');
    const state = new URL(String(begin.headers.location)).searchParams.get(
      'state',
    )!;
    expect((await h.get('/callback?state=' + state + '&code=x')).status).toBe(
      403,
    );
    expect(
      (
        await h
          .get('/callback?state=invalid&code=x')
          .set('Cookie', '__Host-gitea-login=invalid')
      ).status,
    ).toBe(403);
    store.close();
  });
  it('connects a PAT through the portal and prevents CSRF/unknown instances', async () => {
    const { h, store } = setup();
    const { sid, csrf } = await login(h);
    expect(
      (
        await h
          .post('/connections')
          .set('Cookie', sid)
          .type('form')
          .send({ csrf: 'bad', instance: 'alpha', token: 'test-private-token' })
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .post('/connections')
          .set('Cookie', sid)
          .set('Origin', 'https://evil.example')
          .type('form')
          .send({ csrf, instance: 'alpha', token: 'test-private-token' })
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .post('/connections')
          .set('Cookie', sid)
          .type('form')
          .send({ csrf, instance: 'unknown', token: 'test-private-token' })
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .post('/connections')
          .set('Cookie', sid)
          .type('form')
          .send({ csrf, instance: 'alpha', token: 'test-private-token' })
      ).status,
    ).toBe(302);
    expect(store.connection(identity.owner).token).toBe('test-private-token');
    const portal = await h.get('/portal').set('Cookie', sid);
    expect(portal.text).toContain('alpha');
    expect(portal.text).not.toContain('test-private-token');
    expect(portal.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(
      (
        await h
          .post('/connections/disconnect')
          .set('Cookie', sid)
          .type('form')
          .send({ csrf, instance: 'alpha' })
      ).status,
    ).toBe(302);
    expect(store.list(identity.owner)).toEqual([]);
    store.close();
  });
  it('escapes untrusted approval content and binds approval to authenticated owner', async () => {
    const { h, store } = setup();
    const { sid, csrf } = await login(h);
    const id = store.stage(identity.owner, 'alpha', 'rev', 'create_file', {
      content: Buffer.from('<script>alert(1)</script>').toString('base64'),
      message: '<img src=x onerror=alert(1)>',
    });
    const view = await h.get('/approvals/' + id).set('Cookie', sid);
    expect(view.status).toBe(200);
    expect(view.text).toContain('&lt;script&gt;');
    expect(view.text).not.toContain('<script>');
    expect(view.text).not.toContain('<img');
    expect(
      (
        await h
          .post('/approvals/' + id)
          .set('Cookie', sid)
          .type('form')
          .send({ csrf: 'wrong' })
      ).status,
    ).toBe(403);
    expect(
      (
        await h
          .post('/approvals/' + id)
          .set('Cookie', sid)
          .type('form')
          .send({ csrf })
      ).status,
    ).toBe(200);
    expect(store.approval(identity.owner, id).approved).toBe(1);
    const other = store.stage('someone-else', 'alpha', 'rev', 't', {});
    expect((await h.get('/approvals/' + other).set('Cookie', sid)).status).toBe(
      404,
    );
    const plain = store.stage(identity.owner, 'alpha', 'rev', 'create_issue', {
      title: 'normal',
    });
    expect((await h.get('/approvals/' + plain).set('Cookie', sid)).status).toBe(
      200,
    );
    expect(
      (await h.post('/logout').set('Cookie', sid).type('form').send({ csrf }))
        .status,
    ).toBe(302);
    expect((await h.get('/portal').set('Cookie', sid)).headers.location).toBe(
      '/login',
    );
    store.close();
  });
  it('connects optional Gitea OAuth using session-bound PKCE and checks failures', async () => {
    const { h, store } = setup();
    const { sid, csrf } = await login(h);
    expect(
      (
        await h
          .post('/gitea/login')
          .set('Cookie', sid)
          .type('form')
          .send({ csrf, instance: 'alpha' })
      ).status,
    ).toBe(400);
    const begin = await h
      .post('/gitea/login')
      .set('Cookie', sid)
      .type('form')
      .send({ csrf, instance: 'beta' });
    const u = new URL(String(begin.headers.location));
    expect(u.origin).toBe('https://other.example.org');
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = await h
      .get('/gitea/callback?state=' + u.searchParams.get('state') + '&code=x')
      .set('Cookie', sid);
    expect(callback.status).toBe(302);
    expect(store.connection(identity.owner, 'beta').token).toBe(
      'gitea-access-token',
    );
    expect(
      (await h.get('/gitea/callback?state=invalid&code=x').set('Cookie', sid))
        .status,
    ).toBe(403);
    store.close();
  });
  it('sanitizes OAuth exchange and upstream failures', async () => {
    const { h, store } = setup(async () =>
      response({ message: 'secret' }, 401),
    );
    const begin = await h.get('/login');
    const state = new URL(String(begin.headers.location)).searchParams.get(
      'state',
    )!;
    const result = await h
      .get('/callback?state=' + state + '&code=x')
      .set('Cookie', '__Host-gitea-login=' + state);
    expect(result.status).toBe(401);
    expect(result.text).not.toContain('secret');
    store.close();
    const s = setup(async (url) =>
      url.hostname === 'auth.example.org'
        ? response({ access_token: 'test' })
        : response({ message: 'secret' }, 500),
    );
    const browser = await login(s.h);
    const g = await s.h
      .post('/gitea/login')
      .set('Cookie', browser.sid)
      .type('form')
      .send({ csrf: browser.csrf, instance: 'beta' });
    const state2 = new URL(String(g.headers.location)).searchParams.get(
      'state',
    )!;
    expect(
      (
        await s.h
          .get('/gitea/callback?state=' + state2 + '&code=x')
          .set('Cookie', browser.sid)
      ).status,
    ).toBe(401);
    s.store.close();
  });
  it('expires browser sessions and pending OAuth state', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { h, store } = setup();
    const { sid } = await login(h);
    const start = await h.get('/login');
    const state = new URL(String(start.headers.location)).searchParams.get(
      'state',
    )!;
    vi.advanceTimersByTime(600001);
    expect((await h.get('/portal').set('Cookie', sid)).headers.location).toBe(
      '/login',
    );
    expect(
      (
        await h
          .get('/callback?state=' + state + '&code=x')
          .set('Cookie', '__Host-gitea-login=' + state)
      ).status,
    ).toBe(403);
    expect((await h.get('/login')).status).toBe(302);
    store.close();
  });
});
