import { describe, expect, it } from 'vitest';
import supertest from 'supertest';
import { realHarness } from './harness.js';

describe.skipIf(!process.env.GITEA_E2E_URL)(
  'ChatGPT-guided setup against isolated real Gitea',
  () => {
    it('opens setup from MCP, connects through the protected form and uses the new connection over MCP', async () => {
      const h = await realHarness(true);
      const browser = {
        get: (path: string) =>
          supertest(h.app)
            .get(path)
            .set('Host', new URL(h.testConfig.publicUrl).host),
        post: (path: string) =>
          supertest(h.app)
            .post(path)
            .set('Host', new URL(h.testConfig.publicUrl).host),
      };
      try {
        const setup = await h.call('connection_setup', {
          serverUrl: 'https://own.example.org',
        });
        expect(setup.selfService).toBe(true);
        expect(String(setup.setupUrl)).toContain(
          'server=https%3A%2F%2Fown.example.org',
        );
        const start = await browser.get('/login');
        const state = new URL(String(start.headers.location)).searchParams.get(
          'state',
        )!;
        const callback = await browser
          .get('/callback?state=' + state + '&code=fixture')
          .set('Cookie', '__Host-gitea-login=' + state);
        expect(callback.status).toBe(302);
        const sid = (callback.headers['set-cookie'] as unknown as string[])
          .find((c) => c.startsWith('__Host-gitea-session='))!
          .split(';')[0]!;
        const portal = await browser.get('/portal').set('Cookie', sid);
        const csrf = portal.text.match(/name="csrf" value="([^"]+)"/)![1]!;
        const connected = await browser
          .post('/connections/custom')
          .set('Origin', h.testConfig.publicUrl)
          .set('Cookie', sid)
          .type('form')
          .send({
            name: 'chatgpt',
            url: 'https://own.example.org',
            token: process.env.GITEA_E2E_TOKEN!,
            csrf,
          });
        expect(connected.status).toBe(302);
        expect((await h.call('list_instances')).connected).toContain(
          'custom-chatgpt',
        );
        expect(
          (await h.call('connection_status', { instance: 'custom-chatgpt' }))
            .user,
        ).toHaveProperty('login', 'e2e');
        const created = await h.write('create_repository', {
          instance: 'custom-chatgpt',
          name: 'chatgpt-setup-' + Date.now(),
          private: true,
          auto_init: true,
        });
        expect(created.data).toHaveProperty('private', true);
        const disconnected = await browser
          .post('/connections/disconnect')
          .set('Origin', h.testConfig.publicUrl)
          .set('Cookie', sid)
          .type('form')
          .send({ instance: 'custom-chatgpt', csrf });
        expect(disconnected.status).toBe(302);
        expect((await h.call('list_instances')).connected).not.toContain(
          'custom-chatgpt',
        );
      } finally {
        await h.close();
      }
    });
  },
);
