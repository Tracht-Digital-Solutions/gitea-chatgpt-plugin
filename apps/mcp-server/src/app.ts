import express from 'express';
import type { ErrorRequestHandler, Express } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Config } from './config/index.js';
import { authenticator, type Authenticator } from './auth/identity.js';
import { mountPortal } from './auth/portal.js';
import { secureRequester, type Requester } from './security/network.js';
import { SafeError, safeCode } from './security/errors.js';
import { Store } from './security/store.js';
import { RateLimiter } from './security/limits.js';
import { rateLimit } from 'express-rate-limit';
import { ToolService } from './tools/service.js';
import { createMcpServer } from './mcp/server.js';

export function createApp(
  config: Config,
  store: Store,
  overrides: { authenticate?: Authenticator; request?: Requester } = {},
): { app: Express; service: ToolService } {
  const app = express();
  app.disable('x-powered-by');
  const authenticate = overrides.authenticate ?? authenticator(config);
  const request =
    overrides.request ??
    secureRequester(
      [...config.instances.map((i) => i.url), config.tokenUrl],
      config.privateCidrs,
    );
  const service = new ToolService(config, store, request);
  const limits = new RateLimiter(240);
  app.use((req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'Content-Security-Policy':
        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=31536000',
      'X-Frame-Options': 'DENY',
    });
    if (
      req.headers.host !== new URL(config.publicUrl).host &&
      req.path !== '/healthz'
    ) {
      next(new SafeError('INVALID_HOST', 403));
      return;
    }
    if (req.headers.origin && req.headers.origin !== config.publicUrl) {
      next(new SafeError('INVALID_ORIGIN', 403));
      return;
    }
    try {
      limits.take(req.ip ?? '');
      next();
    } catch (e) {
      next(e);
    }
  });
  app.use(express.json({ limit: '1500kb' }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'RATE_LIMITED' },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '1500kb' }));
  app.get('/healthz', (_req, res) => {
    store.db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });
  for (const path of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/mcp',
  ])
    app.get(path, (_req, res) =>
      res.json({
        resource: config.audience,
        authorization_servers: [config.issuer],
        scopes_supported: ['gitea.read', 'gitea.write'],
        bearer_methods_supported: ['header'],
      }),
    );
  mountPortal(app, config, store, authenticate, request);
  app.post('/mcp', async (req, res) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res
        .set(
          'WWW-Authenticate',
          'Bearer resource_metadata="' +
            config.publicUrl +
            '/.well-known/oauth-protected-resource/mcp"',
        )
        .status(401)
        .json({ error: 'AUTHENTICATION_REQUIRED' });
      return;
    }
    let identity;
    try {
      identity = await authenticate(header.slice(7));
    } catch {
      res
        .set(
          'WWW-Authenticate',
          'Bearer resource_metadata="' +
            config.publicUrl +
            '/.well-known/oauth-protected-resource/mcp", error="invalid_token"',
        )
        .status(401)
        .json({ error: 'INVALID_ACCESS_TOKEN' });
      return;
    }
    const server = createMcpServer(service, identity);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on('close', () => {
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.all('/mcp', (_req, res) =>
    res.set('Allow', 'POST').status(405).json({ error: 'METHOD_NOT_ALLOWED' }),
  );
  const errors: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) return;
    res
      .status(error instanceof SafeError ? error.status : 400)
      .json({ error: safeCode(error) });
  };
  app.use(errors);
  return { app, service };
}
