import type { Requester } from '../security/network.js';
import { SafeError } from '../security/errors.js';
export type ApiRequest = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  text?: boolean;
};
export type ApiResult = {
  data: unknown;
  pagination?: { page: number; limit: number; hasNext: boolean };
  version?: string;
};
export class GiteaClient {
  constructor(
    readonly base: string,
    private readonly token: string,
    private readonly request: Requester,
  ) {}
  async call(input: ApiRequest): Promise<ApiResult> {
    if (
      !input.path.startsWith('/') ||
      input.path.startsWith('//') ||
      input.path.split('/').some((s) => s === '.' || s === '..') ||
      input.path.includes('?') ||
      input.path.includes('#')
    )
      throw new SafeError('INVALID_API_PATH');
    const url = new URL(this.base + '/api/v1' + input.path);
    for (const [k, v] of Object.entries(input.query ?? {}))
      if (v !== undefined) url.searchParams.set(k, String(v));
    const method = input.method ?? 'GET';
    let result;
    for (let attempt = 0; attempt < 2; attempt++) {
      result = await this.request(
        url,
        method,
        {
          Authorization: 'token ' + this.token,
          Accept: input.text ? 'text/plain' : 'application/json',
          'Content-Type': 'application/json',
        },
        input.body === undefined ? undefined : JSON.stringify(input.body),
      );
      if (method === 'GET' && result.status === 503 && attempt === 0) continue;
      break;
    }
    if (!result) throw new SafeError('NETWORK_ERROR', 502);
    if (result.status === 401)
      throw new SafeError('GITEA_UNAUTHORIZED_RECONNECT', 401);
    if (result.status === 403) throw new SafeError('GITEA_FORBIDDEN', 403);
    if (result.status === 404)
      throw new SafeError('GITEA_NOT_FOUND_OR_UNSUPPORTED', 404);
    if (result.status === 409 || result.status === 422)
      throw new SafeError('GITEA_CONFLICT_OR_VALIDATION', 409);
    if (result.status === 429) throw new SafeError('GITEA_RATE_LIMITED', 429);
    if (result.status < 200 || result.status >= 300)
      throw new SafeError('GITEA_UPSTREAM_ERROR', 502);
    let data: unknown = null;
    if (input.text) data = result.body;
    else if (result.body) {
      try {
        data = JSON.parse(result.body) as unknown;
      } catch {
        throw new SafeError('GITEA_INVALID_RESPONSE', 502);
      }
    }
    const page = Number(input.query?.page ?? 1),
      limit = Number(input.query?.limit ?? 20);
    return {
      data,
      ...(input.query?.page !== undefined
        ? {
            pagination: {
              page,
              limit,
              hasNext: !!result.headers.link?.includes('rel="next"'),
            },
          }
        : {}),
    };
  }
  async assertFeatureBranch(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<void> {
    const root =
      '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    const details = (await this.call({ path: root })).data as {
      default_branch?: string;
      permissions?: { push?: boolean };
    };
    if (!details.permissions?.push)
      throw new SafeError('REPOSITORY_WRITE_DENIED', 403);
    if (branch === details.default_branch)
      throw new SafeError('FEATURE_BRANCH_REQUIRED', 403);
    const b = (
      await this.call({
        path: root + '/branches/' + encodeURIComponent(branch),
      })
    ).data as { protected?: boolean };
    if (b.protected !== false)
      throw new SafeError('PROTECTED_OR_UNKNOWN_BRANCH', 403);
  }
}
