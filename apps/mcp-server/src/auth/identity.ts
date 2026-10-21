import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Config } from '../config/index.js';
import { SafeError } from '../security/errors.js';
export type Identity = { owner: string; scopes: string[]; expires: number };
export type Authenticator = (token: string) => Promise<Identity>;

export function authenticator(
  config: Pick<Config, 'issuer' | 'audience' | 'jwksUrl'>,
  keys?: JWTVerifyGetKey,
): Authenticator {
  const key =
    keys ??
    createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 5000 });
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256', 'ES256'],
        requiredClaims: ['sub', 'exp', 'iat'],
        clockTolerance: 5,
      });
      if (
        !payload.sub ||
        typeof payload.scope !== 'string' ||
        typeof payload.exp !== 'number'
      )
        throw new Error('Missing claims');
      return {
        owner: createHash('sha256')
          .update(JSON.stringify([payload.iss, payload.sub]))
          .digest('hex'),
        scopes: payload.scope.split(' '),
        expires: payload.exp * 1000,
      };
    } catch {
      throw new SafeError('INVALID_ACCESS_TOKEN', 401);
    }
  };
}
export function authorize(identity: Identity, write = false): void {
  if (identity.expires <= Date.now())
    throw new SafeError('ACCESS_TOKEN_EXPIRED', 401);
  if (!identity.scopes.includes(write ? 'gitea.write' : 'gitea.read'))
    throw new SafeError('INSUFFICIENT_SCOPE', 403);
}
