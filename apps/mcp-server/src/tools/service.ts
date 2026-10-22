import { operations } from './catalog.js';
import type { Config } from '../config/index.js';
import { Store } from '../security/store.js';
import { authorize, type Identity } from '../auth/identity.js';
import { SafeError, safeCode } from '../security/errors.js';
import { GiteaClient } from '../gitea/client.js';
import type { Requester } from '../security/network.js';
import { RateLimiter } from '../security/limits.js';
import { z } from 'zod';
import { publicServerRequest } from '../security/public-server.js';

export class ToolService {
  private readonly limits = new RateLimiter();
  private readonly refreshes = new Map<string, Promise<void>>();
  constructor(
    readonly config: Config,
    readonly store: Store,
    readonly request: Requester,
    private readonly customRequest?: Requester,
  ) {}
  async execute(
    identity: Identity,
    name: string,
    input: unknown,
  ): Promise<Record<string, unknown>> {
    const operation = operations.find((o) => o.name === name);
    if (!operation) throw new SafeError('UNKNOWN_TOOL');
    authorize(identity, operation.write);
    this.limits.take(identity.owner);
    const validation = operation.schema.safeParse(input);
    if (!validation.success) throw new SafeError('INVALID_TOOL_INPUT');
    const p = validation.data as Record<string, unknown>;
    const { approvalId, ...payload } = p;
    if (name === 'list_instances')
      return {
        connected: this.store.list(identity.owner),
        available: this.config.instances.map((i) => ({ id: i.id, url: i.url })),
        setupUrl: this.config.publicUrl + '/portal',
        selfService: this.config.allowUserServers,
      };
    if (name === 'connection_setup')
      return {
        setupUrl:
          this.config.publicUrl +
          '/portal' +
          (p.serverUrl && this.config.allowUserServers
            ? '?server=' + encodeURIComponent(String(p.serverUrl))
            : ''),
        selfService: this.config.allowUserServers,
        instructions: this.config.allowUserServers
          ? 'Open this secure link, sign in, enter your own Gitea HTTPS server and connect your account there. Then return to ChatGPT and call list_instances and connection_status. Never paste credentials into chat. No Docker or .env setup is required for end users; the operator hosts this MCP service once.'
          : 'Open this secure link and connect a server configured in .env. ChatGPT cannot change the server/OAuth configuration; edit .env and rerun node scripts/install.mjs outside ChatGPT to apply settings. Never paste credentials into chat.',
      };
    const conn = await this.connection(
      identity.owner,
      (p.instance ??
        (name === 'select_instance' || name === 'disconnect_instance'
          ? p.selected
          : undefined)) as string | undefined,
    );
    const instance =
      conn.customUrl && this.config.allowUserServers
        ? { id: conn.instance, url: conn.customUrl }
        : !conn.customUrl
          ? this.config.instances.find((i) => i.id === conn.instance)
          : undefined;
    if (!instance) throw new SafeError('INSTANCE_DISABLED', 403);
    const client = new GiteaClient(
      instance.url,
      conn.token,
      conn.customUrl
        ? (this.customRequest ?? publicServerRequest(conn.customUrl))
        : this.request,
    );
    try {
      if (operation.write) {
        // Resolving the active instance now binds the approval to that connection even when input omits it.
        if (!approvalId) {
          const id = this.store.stage(
            identity.owner,
            conn.instance,
            conn.revision,
            name,
            payload,
          );
          this.store.audit(identity.owner, conn.instance, name, 'pending');
          return {
            status: 'approval_required',
            approvalId: id,
            approvalUrl: this.config.publicUrl + '/approvals/' + id,
            expiresInSeconds: 600,
            instructions:
              'The account owner must inspect and approve the exact payload in the browser. Then repeat this tool with identical arguments and approvalId.',
          };
        }
        this.store.consume(
          identity.owner,
          approvalId as string,
          conn.instance,
          conn.revision,
          name,
          payload,
        );
        if (operation.featureBranch)
          await client.assertFeatureBranch(
            String(p.owner),
            String(p.repo),
            String(p.branch),
          );
        if (name === 'update_issue' && p.content_version !== undefined) {
          const current = (
            await client.call({
              path:
                '/repos/' +
                encodeURIComponent(String(p.owner)) +
                '/' +
                encodeURIComponent(String(p.repo)) +
                '/issues/' +
                Number(p.index),
            })
          ).data as { content_version?: number };
          if (current.content_version !== p.content_version)
            throw new SafeError('ISSUE_CHANGED_OR_VERSION_UNSUPPORTED', 409);
        }
        if (name === 'merge_pull_request') {
          const result = (
            await client.call({
              path:
                '/repos/' +
                encodeURIComponent(String(p.owner)) +
                '/' +
                encodeURIComponent(String(p.repo)) +
                '/pulls/' +
                Number(p.index),
            })
          ).data as { head?: { sha?: string }; mergeable?: boolean };
          if (
            result.head?.sha !== p.head_commit_id ||
            result.mergeable !== true
          )
            throw new SafeError('PULL_REQUEST_CHANGED_OR_CONFLICTED', 409);
        }
      }
      let result: Record<string, unknown>;
      if (name === 'select_instance') {
        this.store.setActive(identity.owner, String(p.selected));
        result = { selected: p.selected };
      } else if (name === 'disconnect_instance') {
        this.store.disconnect(identity.owner, String(p.selected));
        result = { disconnected: p.selected };
      } else if (name === 'connection_status')
        result = {
          instance: conn.instance,
          user: (await client.call({ path: '/user' })).data,
          version: (await client.call({ path: '/version' })).data,
        };
      else if (name === 'get_capabilities')
        result = {
          version: (await client.call({ path: '/version' })).data,
          optionalEndpoints:
            'Actions control, projects/Kanban, time tracking, dependency and compare endpoints are probed on use. A 404 means unavailable or inaccessible; no support is inferred from a version string.',
          adminTools: false,
        };
      else if (name === 'search_commit_history') {
        const history = await client.call({
          path:
            '/repos/' +
            encodeURIComponent(String(p.owner)) +
            '/' +
            encodeURIComponent(String(p.repo)) +
            '/commits',
          query: { page: p.page, limit: p.limit, sha: p.sha },
        });
        const commits = z
          .array(
            z
              .object({ commit: z.object({ message: z.string() }) })
              .passthrough(),
          )
          .parse(history.data);
        result = {
          data: commits.filter((c) =>
            c.commit.message.toLowerCase().includes(String(p.q).toLowerCase()),
          ),
          pagination: history.pagination,
          exhaustive: false,
          untrustedContent: true,
        };
      } else if (name === 'search_repository_content') {
        const root =
          '/repos/' +
          encodeURIComponent(String(p.owner)) +
          '/' +
          encodeURIComponent(String(p.repo));
        const tree = z
          .object({
            tree: z.array(z.object({ path: z.string(), type: z.string() })),
            truncated: z.boolean().optional(),
          })
          .parse(
            (
              await client.call({
                path: root + '/git/trees/' + encodeURIComponent(String(p.ref)),
                query: { recursive: true, page: 1, per_page: 50 },
              })
            ).data,
          );
        const candidates = tree.tree
          .filter(
            (f) => f.type === 'blob' && f.path.includes(String(p.pathContains)),
          )
          .slice(0, Number(p.limit));
        const matches: Record<string, unknown>[] = [];
        let scanned = 0;
        for (const candidate of candidates) {
          if (
            candidate.path.split('/').some((s) => s === '.' || s === '..') ||
            candidate.path.includes('\\')
          )
            continue;
          const file = z
            .object({
              content: z.string().optional(),
              encoding: z.string().optional(),
            })
            .parse(
              (
                await client.call({
                  path:
                    root +
                    '/contents/' +
                    candidate.path.split('/').map(encodeURIComponent).join('/'),
                  query: { ref: p.ref },
                })
              ).data,
            );
          if (file.encoding !== 'base64' || !file.content) continue;
          const contents = Buffer.from(file.content, 'base64').toString('utf8');
          scanned++;
          if (contents.includes('\0')) continue;
          const lines = contents
            .split('\n')
            .flatMap((line, index) =>
              line.toLowerCase().includes(String(p.q).toLowerCase())
                ? [{ line: index + 1, text: line.slice(0, 1000) }]
                : [],
            )
            .slice(0, 20);
          if (lines.length)
            matches.push({ path: candidate.path, matches: lines });
        }
        result = {
          data: matches,
          scannedFiles: scanned,
          exhaustive: false,
          treeTruncated: tree.truncated ?? true,
          untrustedContent: true,
        };
      } else if (operation.request)
        result = {
          ...(await client.call(operation.request(p))),
          untrustedContent: true,
        };
      else throw new SafeError('UNKNOWN_TOOL');
      this.store.audit(identity.owner, conn.instance, name, 'success');
      return result;
    } catch (error) {
      this.store.audit(identity.owner, conn.instance, name, safeCode(error));
      throw error;
    }
  }
  private async connection(owner: string, selected?: string) {
    const current = this.store.connection(owner, selected, true);
    if (
      current.expiresAt &&
      current.expiresAt < Date.now() + 30000 &&
      current.refreshToken
    ) {
      const key = owner + ':' + current.instance;
      let refresh = this.refreshes.get(key);
      if (!refresh) {
        refresh = this.refresh(owner, current);
        this.refreshes.set(key, refresh);
      }
      try {
        await refresh;
      } finally {
        this.refreshes.delete(key);
      }
    }
    return this.store.connection(owner, current.instance);
  }
  private async refresh(
    owner: string,
    current: ReturnType<Store['connection']>,
  ): Promise<void> {
    const i = this.config.instances.find((i) => i.id === current.instance);
    if (!i?.oauthClientId)
      throw new SafeError('GITEA_OAUTH_NOT_CONFIGURED', 401);
    const result = await this.request(
      new URL(i.url + '/login/oauth/access_token'),
      'POST',
      { 'Content-Type': 'application/x-www-form-urlencoded' },
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: current.refreshToken!,
        client_id: i.oauthClientId,
        ...(i.oauthClientSecret ? { client_secret: i.oauthClientSecret } : {}),
      }).toString(),
    );
    // Never change a connection replaced or disconnected during the upstream request.
    if (
      this.store.connection(owner, current.instance, true).revision !==
      current.revision
    )
      throw new SafeError('CONNECTION_CHANGED_RECONNECT', 409);
    if (result.status !== 200) {
      this.store.disconnect(owner, current.instance);
      throw new SafeError('GITEA_REFRESH_FAILED_RECONNECT', 401);
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(result.body) as unknown;
    } catch {
      decoded = undefined;
    }
    const token = z
      .object({
        access_token: z.string().min(1),
        refresh_token: z.string().min(1),
        expires_in: z.number().positive(),
      })
      .safeParse(decoded);
    if (!token.success) {
      this.store.disconnect(owner, current.instance);
      throw new SafeError('GITEA_REFRESH_FAILED_RECONNECT', 401);
    }
    this.store.connect(
      owner,
      current.instance,
      JSON.stringify({
        token: token.data.access_token,
        refreshToken: token.data.refresh_token,
        expiresAt: Date.now() + token.data.expires_in * 1000,
      }),
      false,
    );
    this.store.audit(owner, current.instance, 'refresh', 'success');
  }
}
