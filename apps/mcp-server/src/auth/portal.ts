import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';
import { z } from 'zod';
import type { Config } from '../config/index.js';
import { defaultGiteaScopes } from '../config/index.js';
import type { Authenticator, Identity } from './identity.js';
import { authorize } from './identity.js';
import { SafeError } from '../security/errors.js';
import { Store } from '../security/store.js';
import type { Requester } from '../security/network.js';
import { GiteaClient } from '../gitea/client.js';
import { RateLimiter } from '../security/limits.js';
import { rateLimit } from 'express-rate-limit';

const escape = (s: unknown) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
const nonce = () => randomBytes(32).toString('base64url');
const cookie = (req: Request, name: string) =>
  req.headers.cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(name + '='))
    ?.slice(name.length + 1);
const csrfEqual = (a: unknown, b: string) =>
  typeof a === 'string' &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
function page(res: Response, title: string, body: string): void {
  res
    .type('html')
    .send(
      '<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>' +
        escape(title) +
        '</title><link rel="icon" type="image/png" href="/assets/icon.png"><link rel="stylesheet" href="/assets/portal.css"><body><header><img src="/assets/icon.png" alt="" width="48" height="48"><span>Gitea for ChatGPT</span></header><main><h1>' +
        escape(title) +
        '</h1>' +
        body +
        '</main></body></html>',
    );
}
type Session = { identity: Identity; csrf: string; expires: number };
type Pending = {
  verifier: string;
  expires: number;
  session?: string;
  instance?: string;
};

export function mountPortal(
  app: Express,
  config: Config,
  store: Store,
  authenticate: Authenticator,
  request: Requester,
): void {
  const sessions = new Map<string, Session>();
  const pending = new Map<string, Pending>();
  const limits = new RateLimiter(30);
  const browserLimit = rateLimit({
    windowMs: 60000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'RATE_LIMITED' },
  });
  const session = (req: Request): Session => {
    const s = sessions.get(cookie(req, '__Host-gitea-session') ?? '');
    if (!s || s.expires <= Date.now())
      throw new SafeError('BROWSER_LOGIN_REQUIRED', 401);
    authorize(s.identity);
    return s;
  };
  const requireCsrf = (req: Request, s: Session) => {
    if (
      req.headers.origin !== config.publicUrl ||
      !csrfEqual((req.body as Record<string, unknown>).csrf, s.csrf)
    )
      throw new SafeError('CSRF_DENIED', 403);
  };
  app.get('/login', browserLimit, (req, res) => {
    limits.take(req.ip ?? '');
    for (const [id, s] of pending)
      if (s.expires <= Date.now()) pending.delete(id);
    for (const [id, s] of sessions)
      if (s.expires <= Date.now()) sessions.delete(id);
    if (pending.size >= 1000 || sessions.size >= 10000)
      throw new SafeError('TOO_MANY_LOGINS', 429);
    const state = nonce(),
      verifier = nonce();
    pending.set(state, { verifier, expires: Date.now() + 300000 });
    res.cookie('__Host-gitea-login', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 300000,
    });
    const u = new URL(config.authorizationUrl);
    for (const [k, v] of Object.entries({
      client_id: config.portalClientId,
      response_type: 'code',
      redirect_uri: config.publicUrl + '/callback',
      scope: 'openid gitea.read gitea.write',
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      resource: config.audience,
    }))
      u.searchParams.set(k, v);
    res.redirect(u.href);
  });
  app.get('/callback', browserLimit, async (req, res) => {
    const state = z.string().parse(req.query.state);
    const p = pending.get(state);
    pending.delete(state);
    if (
      !p ||
      p.expires <= Date.now() ||
      cookie(req, '__Host-gitea-login') !== state ||
      p.instance
    )
      throw new SafeError('INVALID_OAUTH_STATE', 403);
    const code = z.string().max(4000).parse(req.query.code);
    const result = await request(
      new URL(config.tokenUrl),
      'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: p.verifier,
        client_id: config.portalClientId,
        redirect_uri: config.publicUrl + '/callback',
        resource: config.audience,
      }).toString(),
    );
    if (result.status !== 200)
      throw new SafeError('OAUTH_EXCHANGE_FAILED', 401);
    const token = z
      .object({ access_token: z.string().min(1) })
      .parse(JSON.parse(result.body));
    const identity = await authenticate(token.access_token);
    authorize(identity);
    const sid = nonce();
    sessions.set(sid, {
      identity,
      csrf: nonce(),
      expires: Math.min(identity.expires, Date.now() + 600000),
    });
    res.clearCookie('__Host-gitea-login', {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    res.cookie('__Host-gitea-session', sid, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 600000,
    });
    res.redirect('/portal');
  });
  app.get('/portal', browserLimit, (req, res) => {
    let s: Session;
    try {
      s = session(req);
    } catch {
      res.redirect('/login');
      return;
    }
    const csrf =
      '<input type="hidden" name="csrf" value="' + escape(s.csrf) + '">';
    page(
      res,
      'Gitea for ChatGPT – Verbindungen',
      '<p>Zugangsdaten ausschließlich hier eingeben. Schreibaufträge benötigen eine separate Freigabe.</p>' +
        (config.instances.length === 0
          ? '<section><h2>Eigenen Gitea-Server einrichten</h2><p>Es ist noch kein Gitea-Server eingerichtet. Trage als Betreiber die HTTPS-Adresse deines eigenen Servers unter <code>GITEA_INSTANCES</code> in der Serverkonfiguration ein und starte den MCP-Server neu. Danach kannst du hier dein Gitea-Konto verbinden.</p></section>'
          : '<p>Wähle deinen eigenen, vom Betreiber freigegebenen Gitea-Server und verbinde dein Konto.</p>') +
        config.instances
          .map(
            (i) =>
              '<section><h2>' +
              escape(i.id) +
              '</h2><p>' +
              escape(i.url) +
              '</p><form method="post" action="/connections">' +
              csrf +
              '<input type="hidden" name="instance" value="' +
              escape(i.id) +
              '"><label>Persönliches Gitea-Token <input type="password" name="token" required autocomplete="off" maxlength="4096"></label><button>Verbinden</button></form>' +
              (i.oauthClientId
                ? '<form method="post" action="/gitea/login">' +
                  csrf +
                  '<input type="hidden" name="instance" value="' +
                  escape(i.id) +
                  '"><button>Mit Gitea OAuth verbinden</button></form>'
                : '') +
              '</section>',
          )
          .join('') +
        '<h2>Verbunden</h2><ul>' +
        store
          .list(s.identity.owner)
          .map(
            (i) =>
              '<li>' +
              escape(i) +
              '<form method="post" action="/connections/disconnect">' +
              csrf +
              '<input type="hidden" name="instance" value="' +
              escape(i) +
              '"><button>Trennen</button></form></li>',
          )
          .join('') +
        '</ul><form method="post" action="/logout">' +
        csrf +
        '<button>Abmelden</button></form>',
    );
  });
  app.post('/connections', browserLimit, async (req, res) => {
    const s = session(req);
    authorize(s.identity, true);
    requireCsrf(req, s);
    limits.take(s.identity.owner);
    const p = z
      .object({
        instance: z.string(),
        token: z.string().min(10).max(4096),
        csrf: z.string(),
      })
      .strict()
      .parse(req.body);
    const instance = config.instances.find((i) => i.id === p.instance);
    if (!instance) throw new SafeError('INSTANCE_DISABLED', 403);
    await new GiteaClient(instance.url, p.token, request).call({
      path: '/user',
    });
    store.connect(
      s.identity.owner,
      p.instance,
      JSON.stringify({ token: p.token }),
    );
    store.audit(s.identity.owner, p.instance, 'connect', 'success');
    res.redirect('/portal');
  });
  app.post('/connections/disconnect', browserLimit, (req, res) => {
    const s = session(req);
    authorize(s.identity, true);
    requireCsrf(req, s);
    const instance = z.string().parse(req.body.instance);
    store.disconnect(s.identity.owner, instance);
    store.audit(s.identity.owner, instance, 'disconnect', 'success');
    res.redirect('/portal');
  });
  app.post('/gitea/login', browserLimit, (req, res) => {
    const s = session(req);
    authorize(s.identity, true);
    requireCsrf(req, s);
    limits.take(s.identity.owner);
    const instance = config.instances.find((i) => i.id === req.body.instance);
    if (!instance?.oauthClientId)
      throw new SafeError('GITEA_OAUTH_NOT_CONFIGURED');
    for (const [id, p] of pending)
      if (p.expires <= Date.now()) pending.delete(id);
    if (pending.size >= 1000) throw new SafeError('TOO_MANY_LOGINS', 429);
    const state = nonce(),
      verifier = nonce();
    pending.set(state, {
      verifier,
      session: cookie(req, '__Host-gitea-session'),
      instance: instance.id,
      expires: Date.now() + 300000,
    });
    const u = new URL(instance.url + '/login/oauth/authorize');
    for (const [k, v] of Object.entries({
      client_id: instance.oauthClientId,
      response_type: 'code',
      redirect_uri: config.publicUrl + '/gitea/callback',
      scope: (instance.oauthScopes ?? defaultGiteaScopes).join(' '),
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    }))
      u.searchParams.set(k, v);
    res.redirect(u.href);
  });
  app.get('/gitea/callback', browserLimit, async (req, res) => {
    const s = session(req);
    authorize(s.identity, true);
    const state = z.string().parse(req.query.state),
      p = pending.get(state);
    pending.delete(state);
    if (
      !p ||
      p.expires <= Date.now() ||
      !p.instance ||
      p.session !== cookie(req, '__Host-gitea-session')
    )
      throw new SafeError('INVALID_OAUTH_STATE', 403);
    const i = config.instances.find((i) => i.id === p.instance);
    if (!i?.oauthClientId) throw new SafeError('INSTANCE_DISABLED', 403);
    const result = await request(
      new URL(i.url + '/login/oauth/access_token'),
      'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: i.oauthClientId,
        ...(i.oauthClientSecret ? { client_secret: i.oauthClientSecret } : {}),
        code: z.string().max(4000).parse(req.query.code),
        code_verifier: p.verifier,
        redirect_uri: config.publicUrl + '/gitea/callback',
      }).toString(),
    );
    if (result.status !== 200)
      throw new SafeError('GITEA_OAUTH_EXCHANGE_FAILED', 401);
    const token = z
      .object({
        access_token: z.string().min(1),
        expires_in: z.number().positive(),
        refresh_token: z.string().min(1).optional(),
      })
      .parse(JSON.parse(result.body));
    await new GiteaClient(i.url, token.access_token, request).call({
      path: '/user',
    });
    store.connect(
      s.identity.owner,
      i.id,
      JSON.stringify({
        token: token.access_token,
        expiresAt: Date.now() + token.expires_in * 1000,
        refreshToken: token.refresh_token,
      }),
    );
    store.audit(s.identity.owner, i.id, 'oauth_connect', 'success');
    res.redirect('/portal');
  });
  app.get('/approvals/:id', browserLimit, (req, res) => {
    let s: Session;
    try {
      s = session(req);
    } catch {
      res.redirect('/login');
      return;
    }
    authorize(s.identity, true);
    const id = z
      .string()
      .regex(/^[a-f0-9]{48}$/)
      .parse(req.params.id);
    const a = store.approval(s.identity.owner, id);
    page(
      res,
      'Schreibauftrag prüfen',
      '<p>Nur freigeben, wenn dies Ihrem beabsichtigten Auftrag entspricht. Inhalte unten sind nicht vertrauenswürdig. Base64-Dateiinhalte werden zusätzlich dekodiert angezeigt.</p><h2>' +
        escape(a.tool) +
        '</h2><p>Instanz: ' +
        escape(a.instance) +
        '</p><pre>' +
        escape(a.payload) +
        '</pre>' +
        preview(a.payload as string) +
        '<p>SHA-256: ' +
        escape(a.digest) +
        '</p><form method="post"><input type="hidden" name="csrf" value="' +
        escape(s.csrf) +
        '"><button>Genau diesen Auftrag einmal freigeben</button></form>',
    );
  });
  app.post('/approvals/:id', browserLimit, (req, res) => {
    const s = session(req);
    authorize(s.identity, true);
    requireCsrf(req, s);
    const id = z
      .string()
      .regex(/^[a-f0-9]{48}$/)
      .parse(req.params.id);
    store.approve(s.identity.owner, id);
    store.audit(s.identity.owner, '', 'approve', 'success');
    page(
      res,
      'Freigegeben',
      '<p>Im Chat kann derselbe Auftrag jetzt einmal ausgeführt werden. Die Freigabe verfällt spätestens zehn Minuten nach Erstellung.</p>',
    );
  });
  app.post('/logout', browserLimit, (req, res) => {
    const s = session(req);
    requireCsrf(req, s);
    sessions.delete(cookie(req, '__Host-gitea-session') ?? '');
    res.clearCookie('__Host-gitea-session', {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
    });
    res.redirect('/portal');
  });
}
function preview(payload: string): string {
  const p = JSON.parse(payload) as { content?: string };
  return typeof p.content === 'string'
    ? '<h2>Neuer Dateiinhalt (UTF-8)</h2><pre>' +
        escape(Buffer.from(p.content, 'base64').toString('utf8')) +
        '</pre>'
    : '';
}
