import { randomBytes } from 'node:crypto';
import type { Config } from '../apps/mcp-server/src/config/index.js';
import type { Identity } from '../apps/mcp-server/src/auth/identity.js';
import type { Requester } from '../apps/mcp-server/src/security/network.js';
export const config: Config = {
  publicUrl: 'https://mcp.example.org',
  issuer: 'https://auth.example.org',
  audience: 'https://mcp.example.org/mcp',
  jwksUrl: 'https://auth.example.org/jwks',
  authorizationUrl: 'https://auth.example.org/authorize',
  tokenUrl: 'https://auth.example.org/token',
  portalClientId: 'portal',
  encryptionKey: randomBytes(32),
  database: ':memory:',
  port: 3000,
  instances: [
    { id: 'alpha', url: 'https://git.example.org' },
    {
      id: 'beta',
      url: 'https://other.example.org',
      oauthClientId: 'gitea-client',
      oauthClientSecret: 'test-client-secret',
      oauthScopes: ['read:user', 'write:organization', 'write:package'],
    },
  ],
  privateCidrs: [],
  allowUserServers: false,
};
export const identity: Identity = {
  owner: 'test-user-a',
  scopes: ['gitea.read', 'gitea.write'],
  expires: Date.now() + 3600000,
};
export const response = (
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) => ({ status, headers, body: JSON.stringify(data) });
export const requester: Requester = async (url) =>
  response(
    url.pathname.endsWith('/version')
      ? { version: '1.25.0' }
      : {
          id: 1,
          login: 'alice',
          permissions: { push: true },
          default_branch: 'main',
          protected: false,
        },
  );
