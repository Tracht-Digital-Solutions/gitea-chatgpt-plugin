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
function setup(
  request?: Requester,
  instances = config.instances,
  allowUserServers = false,
  customRequest?: Requester,
  authIdentity = identity,
) {
  const store = new Store(':memory:', config.encryptionKey);
  const result = createApp({ ...config, instances, allowUserServers }, store, {
    customRequest,
    authenticate: async () => authIdentity,
    request:
      request ??
      (async (url) =>
        url.hostname === 'auth.example.org'
          ? response({ access_token: 'test-access' })
          : url.pathname.endsWith('/login/oauth/access_token')
            ? response({ access_token: 'gitea-access-token', expires_in: 3600 })
            : response({ login: 'alice' })),
  });
  return {
    store,
    app: result.app,
    service: result.service,
    h: host(result.app),
  };
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
  it('requires write scope and enforces reserved names, connection quota and the operator disable switch', async () => {
    const customRequest = vi.fn<Requester>(async () =>
      response({ login: 'own-user' }),
    );
    const readOnly = setup(undefined, [], true, customRequest, {
      ...identity,
      scopes: ['gitea.read'],
    });
    try {
      const { sid, csrf } = await login(readOnly.h);
      expect(
        (
          await readOnly.h
            .post('/connections/custom')
            .set('Cookie', sid)
            .type('form')
            .send({
              name: 'work',
              url: 'https://own.example.org',
              token: 'fixture-token',
              csrf,
            })
        ).status,
      ).toBe(403);
      expect(customRequest).not.toHaveBeenCalled();
    } finally {
      readOnly.store.close();
    }
    const reserved = setup(
      undefined,
      [{ id: 'custom-work', url: 'https://reserved.example.org' }],
      true,
      customRequest,
    );
    try {
      const { sid, csrf } = await login(reserved.h);
      const payload = {
        name: 'work',
        url: 'https://own.example.org',
        token: 'fixture-token',
        csrf,
      };
      expect(
        (
          await reserved.h
            .post('/connections/custom')
            .set('Cookie', sid)
            .type('form')
            .send(payload)
        ).status,
      ).toBe(409);
      for (let i = 0; i < 20; i++)
        reserved.store.connect(
          identity.owner,
          'custom-' + i,
          JSON.stringify({
            token: 'fixture-token',
            customUrl: 'https://own.example.org',
          }),
        );
      expect(
        (
          await reserved.h
            .post('/connections/custom')
            .set('Cookie', sid)
            .type('form')
            .send({ ...payload, name: 'new' })
        ).status,
      ).toBe(429);
      const { ToolService } =
        await import('../../apps/mcp-server/src/tools/service.js');
      const disabled = new ToolService(
        { ...config, allowUserServers: false },
        reserved.store,
        customRequest,
        customRequest,
      );
      await expect(
        disabled.execute(identity, 'get_authenticated_user', {
          instance: 'custom-0',
        }),
      ).rejects.toThrow('INSTANCE_DISABLED');
      expect(customRequest).not.toHaveBeenCalled();
    } finally {
      reserved.store.close();
    }
  });
  it('sets up an own server from a ChatGPT link without operator configuration and separates owners', async () => {
    const customRequest = vi.fn<Requester>(async () =>
      response({ login: 'own-user' }),
    );
    const { h, store, service } = setup(undefined, [], true, customRequest);
    try {
      const link = await service.execute(identity, 'connection_setup', {
        serverUrl: 'https://own.example.org/gitea',
      });
      expect(link.selfService).toBe(true);
      expect(link.setupUrl).toBe(
        config.publicUrl +
          '/portal?server=https%3A%2F%2Fown.example.org%2Fgitea',
      );
      const { sid, csrf } = await login(h);
      const portal = await h
        .get('/portal?server=https%3A%2F%2Fown.example.org%2Fgitea')
        .set('Cookie', sid);
      expect(portal.text).toContain('value="https://own.example.org/gitea"');
      expect(portal.text).toContain('action="/connections/custom"');
      const connected = await h
        .post('/connections/custom')
        .set('Cookie', sid)
        .type('form')
        .send({
          name: 'work',
          url: 'https://own.example.org/gitea/',
          token: 'own-fixture-token',
          csrf,
        });
      expect(connected.status).toBe(302);
      expect(customRequest.mock.calls[0]?.[0].href).toBe(
        'https://own.example.org/gitea/api/v1/user',
      );
      expect(store.connection(identity.owner).customUrl).toBe(
        'https://own.example.org/gitea',
      );
      expect(
        JSON.stringify(
          store.db.prepare('SELECT secret FROM connections').get(),
        ),
      ).not.toContain('own-fixture-token');
      expect(
        JSON.stringify(
          store.db.prepare('SELECT secret FROM connections').get(),
        ),
      ).not.toContain('own.example.org');
      expect(
        await service.execute(identity, 'get_authenticated_user', {}),
      ).toHaveProperty('data.login', 'own-user');
      await expect(
        service.execute(
          { ...identity, owner: 'other' },
          'get_authenticated_user',
          { instance: 'custom-work' },
        ),
      ).rejects.toThrow('CONNECTION_REQUIRED');
      store.connect(
        'other',
        'custom-work',
        JSON.stringify({
          token: 'other-fixture-token',
          customUrl: 'https://other.example.net',
        }),
      );
      await service.execute(
        { ...identity, owner: 'other' },
        'get_authenticated_user',
        { instance: 'custom-work' },
      );
      expect(customRequest.mock.calls.at(-1)?.[0].origin).toBe(
        'https://other.example.net',
      );
      expect(store.connection(identity.owner, 'custom-work').customUrl).toBe(
        'https://own.example.org/gitea',
      );
      const staged = await service.execute(identity, 'create_issue', {
        owner: 'alice',
        repo: 'test',
        title: 'Own server write',
      });
      expect(staged.status).toBe('approval_required');
      expect(
        JSON.stringify(await service.execute(identity, 'list_instances', {})),
      ).not.toContain('fixture-token');
      const disconnected = await h
        .post('/connections/disconnect')
        .set('Cookie', sid)
        .type('form')
        .send({ instance: 'custom-work', csrf });
      expect(disconnected.status).toBe(302);
      expect(() => store.connection(identity.owner, 'custom-work')).toThrow(
        'CONNECTION_REQUIRED',
      );
      expect(store.connection('other', 'custom-work').token).toBe(
        'other-fixture-token',
      );
    } finally {
      store.close();
    }
  });
  it('denies self-service without write scope, CSRF, operator permission or safe URL', async () => {
    const customRequest = vi.fn<Requester>(async () =>
      response({ login: 'own-user' }),
    );
    const { h, store } = setup(undefined, [], true, customRequest);
    try {
      const { sid, csrf } = await login(h);
      const payload = {
        name: 'work',
        url: 'https://own.example.org',
        token: 'fixture-token',
        csrf,
      };
      expect(
        (
          await h
            .post('/connections/custom')
            .set('Cookie', sid)
            .type('form')
            .send({ ...payload, csrf: 'wrong' })
        ).status,
      ).toBe(403);
      expect(
        (await h.post('/connections/custom').type('form').send(payload)).status,
      ).toBe(401);
      for (const url of [
        'https://127.0.0.1',
        'https://10.1.2.3',
        'https://own.example.org:3000',
        'http://own.example.org',
      ])
        expect(
          (
            await h
              .post('/connections/custom')
              .set('Cookie', sid)
              .type('form')
              .send({ ...payload, url })
          ).status,
        ).toBe(400);
      expect(customRequest).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
    const disabled = setup(undefined, [], false, customRequest);
    try {
      const { sid, csrf } = await login(disabled.h);
      expect(
        (
          await disabled.h
            .post('/connections/custom')
            .set('Cookie', sid)
            .type('form')
            .send({
              name: 'work',
              url: 'https://own.example.org',
              token: 'fixture-token',
              csrf,
            })
        ).status,
      ).toBe(403);
    } finally {
      disabled.store.close();
    }
  });
  it('serves local branding without allowing scripts or external resources', async () => {
    const { h, store, app } = setup();
    try {
      const icon = await h.get('/assets/icon.png');
      expect(icon.status).toBe(200);
      expect(icon.headers['content-type']).toBe('image/png');
      expect((icon.body as Buffer).readUInt32BE(16)).toBe(512);
      expect((icon.body as Buffer).readUInt32BE(20)).toBe(512);
      const css = await h.get('/assets/portal.css');
      expect(css.status).toBe(200);
      expect(css.headers['content-security-policy']).toContain(
        "default-src 'none'",
      );
      expect(css.headers['content-security-policy']).toContain(
        "style-src 'self'",
      );
      expect(css.headers['content-security-policy']).not.toContain(
        'unsafe-inline',
      );
      const { sid } = await login(h);
      const page = await h.get('/portal').set('Cookie', sid);
      expect(page.text).toContain('href="/assets/portal.css"');
      expect(page.text).toContain('src="/assets/icon.png"');
      const denied = await supertest(app)
        .get('/assets/icon.png')
        .set('Host', 'untrusted.example');
      expect(denied.status).toBe(403);
    } finally {
      store.close();
    }
  });
  it('starts without a predefined Gitea host and asks the operator to configure their own server', async () => {
    const request = vi.fn(async () =>
      response({ access_token: 'test-access' }),
    );
    const { h, store, service } = setup(request, []);
    try {
      const { sid, csrf } = await login(h);
      request.mockClear();
      const view = await h.get('/portal').set('Cookie', sid);
      expect(view.text).toContain('Eigenen Gitea-Server einrichten');
      expect(view.text).toContain('GITEA_INSTANCES');
      expect(view.text).not.toContain('name="token"');
      expect(
        await service.execute(identity, 'list_instances', {}),
      ).toMatchObject({ available: [], connected: [] });
      const denied = await h
        .post('/connections')
        .set('Cookie', sid)
        .type('form')
        .send({ csrf, instance: 'unconfigured', token: 'fixture-token' });
      expect(denied.status).toBe(403);
      expect(request).not.toHaveBeenCalled();
    } finally {
      store.close();
    }
  });
  it('returns HTTP 429 when browser routes exceed the shared IP budget', async () => {
    const { h, store } = setup();
    for (let i = 0; i < 60; i++)
      expect((await h.get('/portal')).status).toBe(302);
    const blocked = await h.get('/portal');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('RATE_LIMITED');
    store.close();
  });
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
    expect(view.text).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(view.text).not.toContain('<img src=x');
    expect(view.text.match(/<img\b/g)).toHaveLength(1);
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
    expect(u.searchParams.get('scope')).toBe(
      'read:user write:organization write:package',
    );
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
