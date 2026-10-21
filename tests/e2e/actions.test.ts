import { describe, it, expect } from 'vitest';
import { realHarness } from './harness.js';

describe.skipIf(!process.env.GITEA_E2E_URL || !process.env.GITEA_E2E_TOKEN)(
  'real Actions execution',
  () => {
    it('dispatches, executes, reruns runs/failed jobs/one job and cancels a running pipeline', async () => {
      const h = await realHarness();
      const { call, write } = h;
      try {
        await write('create_repository', {
          name: 'pipeline-matrix',
          auto_init: true,
          private: true,
        });
        const base = { owner: 'e2e', repo: 'pipeline-matrix' };
        const branch = (
          (await call('get_repository', base)).data as {
            default_branch: string;
          }
        ).default_branch;
        await write('create_branch', {
          ...base,
          new_branch_name: 'feature/pipelines',
          old_branch_name: branch,
        });
        const workflow =
          'name: Pipeline matrix\non:\n  workflow_dispatch:\n    inputs:\n      fail:\n        type: string\n        default: "false"\n      wait:\n        type: string\n        default: "no"\njobs:\n  verify:\n    runs-on: mcp-host\n    steps:\n      - name: Controlled fixture\n        env:\n          FAIL: ${{ inputs.fail }}\n          WAIT: ${{ inputs.wait }}\n        run: |\n          echo MCP_PIPELINE_EXECUTED\n          if [ "$WAIT" = "yes" ]; then sleep 30; fi\n          if [ "$FAIL" = "true" ]; then exit 1; fi\n';
        await write('create_file', {
          ...base,
          path: '.gitea/workflows/matrix.yml',
          branch: 'feature/pipelines',
          message: 'test: controlled runner fixture',
          content: Buffer.from(workflow).toString('base64'),
        });
        const pr = (
          await write('create_pull_request', {
            ...base,
            title: 'Pipeline fixture',
            base: branch,
            head: 'feature/pipelines',
          })
        ).data as { number: number };
        let mergeHead = '';
        let ready = false;
        for (let i = 0; i < 40; i++) {
          const current = (
            await call('get_pull_request', { ...base, index: pr.number })
          ).data as { mergeable: boolean; head: { sha: string } };
          if (current.mergeable && current.head.sha === mergeHead) {
            ready = true;
            break;
          }
          mergeHead = current.mergeable ? current.head.sha : '';
          await new Promise((r) => setTimeout(r, 500));
        }
        expect(mergeHead).toMatch(/^[a-f0-9]{40}$/);
        expect(ready).toBe(true);
        await write('merge_pull_request', {
          ...base,
          index: pr.number,
          do: 'merge',
          head_commit_id: mergeHead,
        });
        const target = { ...base, workflow: 'matrix.yml' };
        type Run = {
          id: number;
          status: string;
          conclusion: string;
          run_attempt: number;
        };
        const waitFor = async (
          run: number,
          attempt: number,
          terminal = true,
        ) => {
          for (let i = 0; i < 60; i++) {
            const current = (await call('get_action_run', { ...base, run }))
              .data as Run;
            if (
              current.run_attempt >= attempt &&
              (terminal
                ? current.status === 'completed'
                : current.status === 'in_progress')
            )
              return current;
            await new Promise((r) => setTimeout(r, 1000));
          }
          throw Error('Runner did not reach expected state/attempt');
        };
        const dispatch = async (inputs: Record<string, string>) => {
          await write('dispatch_action_workflow', {
            ...target,
            ref: branch,
            inputs,
            return_run_details: true,
            scoped_workflow_source_repo_id: 0,
          });
          const result = (
            await call('list_action_workflow_runs', {
              ...target,
              event: 'workflow_dispatch',
              branch,
              actor: 'e2e',
              exclude_pull_requests: true,
            })
          ).data as { workflow_runs: Run[] };
          expect(result.workflow_runs.length).toBeGreaterThan(0);
          return result.workflow_runs[0]!.id;
        };
        const failed = await dispatch({ fail: 'true', wait: 'no' });
        expect((await waitFor(failed, 1)).conclusion).toBe('failure');
        await write('rerun_failed_action_jobs', { ...base, run: failed });
        expect((await waitFor(failed, 2)).conclusion).toBe('failure');
        const jobs = (await call('list_action_jobs', { ...base, run: failed }))
          .data as { jobs: { id: number }[] };
        expect(jobs.jobs.length).toBeGreaterThan(0);
        await write('rerun_action_job', {
          ...base,
          run: failed,
          job: jobs.jobs[0]!.id,
        });
        expect((await waitFor(failed, 3)).conclusion).toBe('failure');
        await write('rerun_action_run', { ...base, run: failed });
        expect((await waitFor(failed, 4)).conclusion).toBe('failure');
        const success = await dispatch({ fail: 'false', wait: 'no' });
        expect((await waitFor(success, 1)).conclusion).toBe('success');
        const running = await dispatch({ fail: 'false', wait: 'yes' });
        await waitFor(running, 1, false);
        await write('cancel_action_run', { ...base, run: running });
        expect((await waitFor(running, 1)).conclusion).toBe('cancelled');
      } finally {
        await h.close();
      }
    }, 180000);
  },
);
