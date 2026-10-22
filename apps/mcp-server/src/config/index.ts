import { z } from 'zod';

export const defaultGiteaScopes = [
  'read:user',
  'read:repository',
  'write:repository',
  'read:issue',
  'write:issue',
];

const httpsUrl = z
  .url()
  .refine((v) => new URL(v).protocol === 'https:', 'HTTPS required');
export const instanceSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,40}$/),
    url: httpsUrl,
    oauthClientId: z.string().min(1).optional(),
    oauthClientSecret: z.string().min(1).optional(),
    oauthScopes: z
      .array(
        z.enum([
          'read:user',
          'write:user',
          'read:repository',
          'write:repository',
          'read:issue',
          'write:issue',
          'read:organization',
          'write:organization',
          'read:package',
          'write:package',
        ]),
      )
      .min(1)
      .max(10)
      .refine(
        (v) =>
          new Set(v).size === v.length &&
          v.some((s) => s === 'read:user' || s === 'write:user'),
      )
      .optional(),
  })
  .strict();
export type Instance = z.infer<typeof instanceSchema>;
export type Config = {
  publicUrl: string;
  issuer: string;
  audience: string;
  jwksUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  portalClientId: string;
  encryptionKey: Buffer;
  database: string;
  port: number;
  instances: Instance[];
  privateCidrs: string[];
  allowUserServers: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = z
    .object({
      PUBLIC_URL: httpsUrl,
      OAUTH_ISSUER: httpsUrl,
      OAUTH_AUDIENCE: z.string().min(1),
      OAUTH_JWKS_URL: httpsUrl,
      OAUTH_AUTHORIZATION_URL: httpsUrl,
      OAUTH_TOKEN_URL: httpsUrl,
      PORTAL_CLIENT_ID: z.string().min(1),
      ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
      DATABASE_PATH: z.string().default('data/gitea.sqlite'),
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
      GITEA_INSTANCES: z
        .string()
        .transform((v, ctx) => {
          try {
            return JSON.parse(v) as unknown;
          } catch {
            ctx.addIssue({ code: 'custom', message: 'Invalid instance JSON' });
            return z.NEVER;
          }
        })
        .pipe(z.array(instanceSchema)),
      ALLOWED_PRIVATE_CIDRS: z.string().default(''),
      ALLOW_USER_SERVERS: z.enum(['true', 'false']).default('false'),
    })
    .parse(env);
  const publicUrl = new URL(parsed.PUBLIC_URL);
  if (
    publicUrl.pathname !== '/' ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password
  )
    throw new Error('PUBLIC_URL must be an HTTPS origin');
  const instances = parsed.GITEA_INSTANCES.map((i) => {
    const u = new URL(i.url);
    if (u.username || u.password || u.search || u.hash)
      throw new Error('Invalid instance URL');
    return { ...i, url: u.href.replace(/\/$/, '') };
  });
  if (new Set(instances.map((i) => i.id)).size !== instances.length)
    throw new Error('Duplicate instance IDs');
  return {
    publicUrl: publicUrl.origin,
    issuer: parsed.OAUTH_ISSUER,
    audience: parsed.OAUTH_AUDIENCE,
    jwksUrl: parsed.OAUTH_JWKS_URL,
    authorizationUrl: parsed.OAUTH_AUTHORIZATION_URL,
    tokenUrl: parsed.OAUTH_TOKEN_URL,
    portalClientId: parsed.PORTAL_CLIENT_ID,
    encryptionKey: Buffer.from(parsed.ENCRYPTION_KEY, 'hex'),
    database: parsed.DATABASE_PATH,
    port: parsed.PORT,
    instances,
    allowUserServers: parsed.ALLOW_USER_SERVERS === 'true',
    privateCidrs: parsed.ALLOWED_PRIVATE_CIDRS.split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}
