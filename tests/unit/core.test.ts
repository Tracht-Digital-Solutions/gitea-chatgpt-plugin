import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import { Store, canonical } from '../../apps/mcp-server/src/security/store.js';
import {
  SafeError,
  safeCode,
} from '../../apps/mcp-server/src/security/errors.js';
import { RateLimiter } from '../../apps/mcp-server/src/security/limits.js';
import {
  authenticator,
  authorize,
} from '../../apps/mcp-server/src/auth/identity.js';
import { loadConfig } from '../../apps/mcp-server/src/config/index.js';
import { config, identity } from '../helpers.js';
afterEach(() => vi.useRealTimers());
describe('encrypted tenant store', () => {
  it('separates tenants, active instances and credentials', () => {
    const store = new Store(':memory:', randomBytes(32));
    store.connect('a', 'alpha', JSON.stringify({ token: 'private-token-a' }));
    store.connect('a', 'beta', JSON.stringify({ token: 'b' }));
    store.connect('b', 'alpha', JSON.stringify({ token: 'other' }));
    expect(store.connection('a').instance).toBe('beta');
    store.setActive('a', 'alpha');
    expect(store.connection('a').token).toBe('private-token-a');
    expect(store.list('b')).toEqual(['alpha']);
    expect(
      store.db
        .prepare('SELECT secret FROM connections')
        .all()
        .map((x) => x.secret)
        .join(''),
    ).not.toContain('private-token-a');
    expect(() => store.connection('c', 'alpha')).toThrow('CONNECTION_REQUIRED');
    expect(() => store.setActive('b', 'beta')).toThrow('CONNECTION_REQUIRED');
    store.disconnect('a', 'alpha');
    expect(() => store.connection('a')).toThrow('CONNECTION_REQUIRED');
    expect(store.connection('b').token).toBe('other');
    store.close();
  });
  it('authenticates ciphertext and binds it to tenant and instance', () => {
    const store = new Store(':memory:', randomBytes(32));
    const sealed = store.seal('a', 'i', 'secret');
    expect(store.open('a', 'i', sealed)).toBe('secret');
    expect(() => store.open('b', 'i', sealed)).toThrow(
      'CREDENTIALS_UNAVAILABLE',
    );
    expect(() => store.open('a', 'j', sealed)).toThrow();
    const b = Buffer.from(sealed, 'base64');
    b[15] = b[15]! ^ 1;
    expect(() => store.open('a', 'i', b.toString('base64'))).toThrow();
    store.close();
    expect(() => new Store(':memory:', Buffer.alloc(2))).toThrow('256-bit');
  });
  it('fails closed when a Gitea token expires', () => {
    const store = new Store(':memory:', randomBytes(32));
    store.connect(
      'a',
      'i',
      JSON.stringify({ token: 'x', expiresAt: Date.now() - 1 }),
    );
    expect(() => store.connection('a')).toThrow('GITEA_TOKEN_EXPIRED');
    store.close();
  });
  it('requires exact single-use approved mutations and rejects replay/tenant crossover', () => {
    const s = new Store(':memory:', randomBytes(32));
    const id = s.stage('a', 'i', 'rev', 'write', { b: 2, a: 1 });
    expect(() => s.approval('b', id)).toThrow();
    expect(() =>
      s.consume('a', id, 'i', 'rev', 'write', { a: 1, b: 2 }),
    ).toThrow('HUMAN_APPROVAL_REQUIRED');
    s.approve('a', id);
    for (const [who, instance, revision, tool, payload] of [
      ['b', 'i', 'rev', 'write', { a: 1, b: 2 }],
      ['a', 'j', 'rev', 'write', { a: 1, b: 2 }],
      ['a', 'i', 'old', 'write', { a: 1, b: 2 }],
      ['a', 'i', 'rev', 'other', { a: 1, b: 2 }],
      ['a', 'i', 'rev', 'write', { a: 3, b: 2 }],
    ] as const)
      expect(() =>
        s.consume(who, id, instance, revision, tool, payload),
      ).toThrow();
    s.consume('a', id, 'i', 'rev', 'write', { a: 1, b: 2 });
    expect(() =>
      s.consume('a', id, 'i', 'rev', 'write', { a: 1, b: 2 }),
    ).toThrow();
    s.close();
  });
  it('expires, bounds and deletes pending approvals', () => {
    vi.useFakeTimers();
    const s = new Store(':memory:', randomBytes(32));
    const id = s.stage('a', 'i', 'r', 't', {});
    vi.advanceTimersByTime(600001);
    expect(() => s.approve('a', id)).toThrow();
    for (let i = 0; i < 20; i++) s.stage('a', 'i', 'r', 't', {});
    expect(() => s.stage('a', 'i', 'r', 't', {})).toThrow('TOO_MANY');
    s.disconnect('a', 'i');
    expect(s.db.prepare('SELECT * FROM approvals').all()).toEqual([]);
    s.audit('a', 'i', 't', 'success');
    expect(s.db.prepare('SELECT * FROM audit').all()).toHaveLength(1);
    s.close();
  });
  it('canonicalizes nested values without depending on key order', () => {
    expect(canonical({ b: [null, 2], a: { z: undefined, b: true } })).toBe(
      '{"a":{"b":true},"b":[null,2]}',
    );
  });
});
describe('OAuth resource token verification', () => {
  it('checks signatures, issuer, audience, expiry, identity and scopes', async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256');
    const jwk = await exportJWK(publicKey);
    const keys = createLocalJWKSet({
      keys: [{ ...jwk, kid: 'test', alg: 'RS256' }],
    });
    const auth = authenticator(config, keys);
    const token = (
      payload: Record<string, unknown> = {},
      issuer = config.issuer,
      audience = config.audience,
    ) =>
      new SignJWT({ scope: 'gitea.read gitea.write', ...payload })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' })
        .setSubject('immutable-id')
        .setIssuer(issuer)
        .setAudience(audience)
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);
    const a = await auth(await token());
    expect(a.scopes).toContain('gitea.write');
    expect(a.owner).toHaveLength(64);
    expect((await auth(await token())).owner).toBe(a.owner);
    await expect(auth(await token({}, 'https://evil.example'))).rejects.toThrow(
      'INVALID_ACCESS_TOKEN',
    );
    await expect(
      auth(await token({}, config.issuer, 'other-api')),
    ).rejects.toThrow();
    await expect(auth('not-a-token')).rejects.toThrow();
    await expect(auth(await token({ scope: 42 }))).rejects.toThrow();
    const expired = await new SignJWT({ scope: 'gitea.read' })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject('s')
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt()
      .setExpirationTime(1)
      .sign(privateKey);
    await expect(auth(expired)).rejects.toThrow();
    const noSub = await new SignJWT({ scope: 'gitea.read' })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(config.issuer)
      .setAudience(config.audience)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await expect(auth(noSub)).rejects.toThrow();
    expect(() => authorize({ ...identity, expires: 0 })).toThrow('EXPIRED');
    expect(() =>
      authorize({ ...identity, scopes: ['gitea.read'] }, true),
    ).toThrow('INSUFFICIENT_SCOPE');
    expect(() => authorize(identity, true)).not.toThrow();
    expect(typeof authenticator(config)).toBe('function');
  });
});
describe('configuration and limits', () => {
  it('bounds distinct rate-limit buckets and prunes expired entries', () => {
    vi.useFakeTimers();
    const limiter = new RateLimiter(2, 1000);
    for (let i = 0; i < 10000; i++) limiter.take('user-' + i);
    expect(() => limiter.take('extra')).toThrow('RATE_LIMITED');
    vi.advanceTimersByTime(1001);
    expect(() => limiter.take('extra')).not.toThrow();
  });
  it('validates HTTPS, secrets, origin and instance uniqueness', () => {
    const env = {
      PUBLIC_URL: config.publicUrl,
      OAUTH_ISSUER: config.issuer,
      OAUTH_AUDIENCE: config.audience,
      OAUTH_JWKS_URL: config.jwksUrl,
      OAUTH_AUTHORIZATION_URL: config.authorizationUrl,
      OAUTH_TOKEN_URL: config.tokenUrl,
      PORTAL_CLIENT_ID: config.portalClientId,
      ENCRYPTION_KEY: config.encryptionKey.toString('hex'),
      GITEA_INSTANCES: JSON.stringify(config.instances),
    };
    expect(loadConfig(env).instances).toEqual(config.instances);
    expect(loadConfig({ ...env, GITEA_INSTANCES: '[]' }).instances).toEqual([]);
    expect(
      loadConfig({
        ...env,
        ALLOWED_PRIVATE_CIDRS: '10.0.0.0/8, 192.168.0.0/16',
      }).privateCidrs,
    ).toHaveLength(2);
    for (const extra of [
      { PUBLIC_URL: 'http://unsafe' },
      { PUBLIC_URL: config.publicUrl + '/path' },
      { PUBLIC_URL: 'https://u:p@mcp.example.org' },
      { ENCRYPTION_KEY: 'bad' },
      { GITEA_INSTANCES: 'bad' },
      {
        GITEA_INSTANCES: JSON.stringify([
          config.instances[0],
          config.instances[0],
        ]),
      },
      { GITEA_INSTANCES: '[{"id":"x","url":"https://u:p@host"}]' },
    ])
      expect(() => loadConfig({ ...env, ...extra })).toThrow();
  });
  it('rate limits and resets after the configured interval', () => {
    vi.useFakeTimers();
    const l = new RateLimiter(2, 1000);
    l.take('a');
    l.take('a');
    expect(() => l.take('a')).toThrow('RATE_LIMITED');
    l.take('b');
    vi.advanceTimersByTime(1001);
    expect(() => l.take('a')).not.toThrow();
  });
  it('scrubs unknown failures', () => {
    expect(safeCode(new Error('token=secret'))).toBe('INTERNAL_ERROR');
    expect(safeCode(new SafeError('SAFE'))).toBe('SAFE');
  });
});
