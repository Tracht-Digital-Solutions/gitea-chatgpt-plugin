import { describe, it, expect } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createApp } from '../../apps/mcp-server/src/app.js';
import { Store } from '../../apps/mcp-server/src/security/store.js';
import type { Requester } from '../../apps/mcp-server/src/security/network.js';
import { config, identity } from '../helpers.js';
const url = process.env.GITEA_E2E_URL,
  token = process.env.GITEA_E2E_TOKEN;
describe.skipIf(!url || !token)('isolated real Gitea via MCP', () => {
  it('manages repositories, Kanban, time tracking, Actions, PRs and releases through MCP with exact approvals', async () => {
    if (!url?.startsWith('http://127.0.0.1:') || !token)
      throw new Error('Only the disposable loopback fixture is permitted');
    const request: Requester = async (target, method, headers, body) => {
      const actual = new URL(target.pathname + target.search, url);
      const result = await fetch(actual, {
        method,
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      });
      return {
        status: result.status,
        headers: Object.fromEntries(result.headers),
        body: await result.text(),
      };
    };
    const store = new Store(':memory:', config.encryptionKey);
    store.connect(identity.owner, 'alpha', JSON.stringify({ token }));
    const testConfig = { ...config };
    const { app } = createApp(testConfig, store, {
      authenticate: async () => identity,
      request,
    });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', r));
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    testConfig.publicUrl = 'http://127.0.0.1:' + address.port;
    const client = new Client({ name: 'real-gitea-e2e', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL(testConfig.publicUrl + '/mcp'),
      {
        requestInit: {
          headers: { Authorization: 'Bearer isolated-test-identity' },
        },
      },
    );
    const call = async (name: string, args: Record<string, unknown> = {}) => {
      const r = await client.callTool({ name, arguments: args });
      expect(r.isError, JSON.stringify(r.content)).not.toBe(true);
      return (r.structuredContent as { result: Record<string, unknown> })
        .result;
    };
    const write = async (name: string, args: Record<string, unknown>) => {
      const staged = await call(name, args);
      expect(staged.status).toBe('approval_required');
      store.approve(identity.owner, String(staged.approvalId));
      return call(name, { ...args, approvalId: staged.approvalId });
    };
    try {
      await client.connect(transport);
      const status = await call('connection_status');
      expect(status.user).toHaveProperty('login', 'e2e');
      const repo = 'mcp-e2e';
      await write('create_repository', {
        name: repo,
        private: true,
        auto_init: true,
      });
      const base = { owner: 'e2e', repo };
      expect((await call('list_repositories')).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: repo, private: true }),
        ]),
      );
      const details = (await call('get_repository', base)).data as {
        default_branch: string;
      };
      const branch = details.default_branch;
      await write('create_branch', {
        ...base,
        new_branch_name: 'feature/e2e',
        old_branch_name: branch,
      });
      await write('create_file', {
        ...base,
        path: '.gitea/workflows/manual.yml',
        branch: 'feature/e2e',
        message: 'feat: manual workflow fixture',
        content: Buffer.from(
          'name: Manual MCP test\non:\n  workflow_dispatch:\njobs:\n  test:\n    runs-on: isolated-no-runner\n    steps:\n      - run: echo isolated\n',
        ).toString('base64'),
      });
      await write('create_file', {
        ...base,
        path: 'hello.txt',
        branch: 'feature/e2e',
        message: 'feat: hello',
        content: Buffer.from('hello MCP\n').toString('base64'),
      });
      const file = (
        await call('read_file', {
          ...base,
          path: 'hello.txt',
          ref: 'feature/e2e',
        })
      ).data as { content: string; sha: string };
      expect(Buffer.from(file.content, 'base64').toString()).toBe(
        'hello MCP\n',
      );
      await write('update_file', {
        ...base,
        path: 'hello.txt',
        branch: 'feature/e2e',
        message: 'fix: greeting',
        sha: file.sha,
        content: Buffer.from('hello Gitea\n').toString('base64'),
      });
      const commits = (
        await call('list_commits', { ...base, sha: 'feature/e2e' })
      ).data as { sha: string }[];
      const head = commits[0]!.sha;
      expect(
        String((await call('get_commit_diff', { ...base, sha: head })).data),
      ).toContain('hello Gitea');
      expect(
        (
          await call('search_repository_content', {
            ...base,
            ref: 'feature/e2e',
            q: 'hello Gitea',
            pathContains: 'hello',
          })
        ).data,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: 'hello.txt' }),
        ]),
      );
      expect(
        (
          await call('search_commit_history', {
            ...base,
            sha: 'feature/e2e',
            q: 'greeting',
          })
        ).data,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ sha: head })]),
      );
      const issue = (
        await write('create_issue', {
          ...base,
          title: 'E2E issue',
          body: 'untrusted test data',
        })
      ).data as { number: number; id: number };
      const timeArgs = { ...base, index: issue.number };
      const booked = (
        await write('add_issue_time', { ...timeArgs, time: 1800 })
      ).data as { id: number; time: number };
      expect(booked.time).toBe(1800);
      expect((await call('list_issue_times', timeArgs)).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: booked.id, time: 1800 }),
        ]),
      );
      expect((await call('list_repository_times', base)).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: booked.id })]),
      );
      expect((await call('list_my_times')).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: booked.id })]),
      );
      await write('delete_issue_time', { ...timeArgs, time_id: booked.id });
      await write('start_issue_stopwatch', timeArgs);
      expect((await call('list_stopwatches')).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ issue_index: issue.number }),
        ]),
      );
      await write('stop_issue_stopwatch', timeArgs);
      await write('start_issue_stopwatch', timeArgs);
      await write('discard_issue_stopwatch', timeArgs);
      expect((await call('list_stopwatches')).data).toEqual([]);

      const project = (
        await write('create_project', {
          ...base,
          title: 'MCP Kanban',
          template_type: 'none',
        })
      ).data as { id: number };
      const projectArgs = { ...base, project: project.id };
      expect((await call('list_projects', base)).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: project.id })]),
      );
      const todo = (
        await write('create_project_column', {
          ...projectArgs,
          title: 'Todo',
          color: '#aabbcc',
        })
      ).data as { id: number };
      const done = (
        await write('create_project_column', { ...projectArgs, title: 'Done' })
      ).data as { id: number };
      await write('add_project_issue', {
        ...projectArgs,
        column: todo.id,
        issue_id: issue.id,
      });
      await write('move_project_issue', {
        ...projectArgs,
        issue_id: issue.id,
        column_id: done.id,
      });
      expect(
        (
          await call('list_project_column_issues', {
            ...projectArgs,
            column: done.id,
          })
        ).data,
      ).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: issue.id })]),
      );
      await write('remove_project_issue', {
        ...projectArgs,
        column: done.id,
        issue_id: issue.id,
      });
      await write('update_project', { ...projectArgs, state: 'closed' });
      expect((await call('get_project', projectArgs)).data).toHaveProperty(
        'state',
        'closed',
      );
      await write('delete_project', projectArgs);
      await write('create_issue_comment', {
        ...base,
        index: issue.number,
        body: 'tested through MCP',
      });
      expect(
        (await call('list_issue_comments', { ...base, index: issue.number }))
          .data,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ body: 'tested through MCP' }),
        ]),
      );
      await write('update_issue', {
        ...base,
        index: issue.number,
        state: 'closed',
      });
      const label = (
        await write('create_label', {
          ...base,
          name: 'tested',
          color: '00aa44',
        })
      ).data as { id: number };
      await write('set_issue_labels', {
        ...base,
        index: issue.number,
        labels: [label.id],
      });
      const milestone = (
        await write('create_milestone', { ...base, title: 'E2E milestone' })
      ).data as { id: number };
      await write('update_issue', {
        ...base,
        index: issue.number,
        milestone: milestone.id,
      });
      expect((await call('list_labels', base)).data).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'tested' })]),
      );
      const pr = (
        await write('create_pull_request', {
          ...base,
          title: 'E2E change',
          base: branch,
          head: 'feature/e2e',
        })
      ).data as { number: number };
      expect(
        String(
          (await call('get_pull_request_diff', { ...base, index: pr.number }))
            .data,
        ),
      ).toContain('hello Gitea');
      await write('create_review', {
        ...base,
        index: pr.number,
        event: 'COMMENT',
        body: 'Reviewed in isolated MCP test',
        commit_id: head,
      });
      expect(
        (await call('list_reviews', { ...base, index: pr.number })).data,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ body: 'Reviewed in isolated MCP test' }),
        ]),
      );
      let mergeable = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        const detail = (
          await call('get_pull_request', { ...base, index: pr.number })
        ).data as { mergeable: boolean };
        if (detail.mergeable) {
          mergeable = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(mergeable).toBe(true);
      await write('merge_pull_request', {
        ...base,
        index: pr.number,
        do: 'merge',
        head_commit_id: head,
      });
      expect(
        (await call('get_pull_request', { ...base, index: pr.number })).data,
      ).toHaveProperty('merged', true);
      const workflowArgs = { ...base, workflow: 'manual.yml' };
      await write('disable_action_workflow', workflowArgs);
      expect(
        (await call('get_action_workflow', workflowArgs)).data,
      ).toHaveProperty('state', 'disabled_manually');
      await write('enable_action_workflow', workflowArgs);
      await write('dispatch_action_workflow', {
        ...workflowArgs,
        ref: branch,
        inputs: {},
      });
      let runId: number | undefined;
      for (let attempt = 0; attempt < 10; attempt++) {
        const runs = (await call('list_action_workflow_runs', workflowArgs))
          .data as { workflow_runs: { id: number }[] };
        runId = runs.workflow_runs[0]?.id;
        if (runId) break;
        await new Promise((r) => setTimeout(r, 250));
      }
      expect(runId).toBeDefined();
      await write('cancel_action_run', { ...base, run: runId });
      await write('create_tag', {
        ...base,
        tag_name: 'v0.0.1-test',
        target: head,
      });
      await write('create_release', {
        ...base,
        tag_name: 'v0.0.1-test',
        target_commitish: head,
        name: 'E2E release',
        draft: false,
        prerelease: true,
      });
      expect((await call('list_releases', base)).data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ tag_name: 'v0.0.1-test' }),
        ]),
      );
      const protectedWrite = await call('create_file', {
        ...base,
        path: 'unsafe.txt',
        branch,
        message: 'unsafe',
        content: 'eA==',
      });
      store.approve(identity.owner, String(protectedWrite.approvalId));
      const denied = await client.callTool({
        name: 'create_file',
        arguments: {
          ...base,
          path: 'unsafe.txt',
          branch,
          message: 'unsafe',
          content: 'eA==',
          approvalId: protectedWrite.approvalId,
        },
      });
      expect(denied.isError).toBe(true);
      expect(JSON.stringify(denied)).toContain('FEATURE_BRANCH_REQUIRED');
    } finally {
      await client.close();
      await new Promise<void>((r) => server.close(() => r()));
      store.close();
    }
  }, 60000);
});
