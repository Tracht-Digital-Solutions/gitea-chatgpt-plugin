import { describe, it, expect } from 'vitest';
import { realHarness } from './harness.js';

describe.skipIf(!process.env.GITEA_E2E_URL || !process.env.GITEA_E2E_TOKEN)(
  'project parameter round trips',
  () => {
    it.each(['repository', 'organization', 'user'] as const)(
      'persists all project/column parameters and moves cards in %s scope',
      async (scope) => {
        const h = await realHarness();
        const { call, write } = h;
        try {
          const org = 'mcp-board-org',
            repo = 'board-' + scope;
          if (scope === 'organization') {
            await write('create_organization', { username: org });
            await write('create_organization_repository', { org, name: repo });
          } else await write('create_repository', { name: repo });
          const base = { owner: scope === 'organization' ? org : 'e2e', repo };
          const target =
            scope === 'repository'
              ? base
              : scope === 'organization'
                ? { org }
                : {};
          const suffix = scope === 'repository' ? '' : '_' + scope;
          const project = (
            await write('create_project' + suffix, {
              ...target,
              title: 'Field board',
              description: 'Before',
              card_type: 'text_only',
              template_type: 'none',
            })
          ).data as { id: number };
          const projectArgs = { ...target, project: project.id };
          await write('update_project' + suffix, {
            ...projectArgs,
            title: 'Updated board',
            description: 'After',
            card_type: 'images_and_text',
            state: 'closed',
          });
          expect(
            (await call('get_project' + suffix, projectArgs)).data,
          ).toMatchObject({
            title: 'Updated board',
            description: 'After',
            card_type: 'images_and_text',
            state: 'closed',
          });
          await write('update_project' + suffix, {
            ...projectArgs,
            state: 'open',
          });
          const left = (
            await write('create_project_column' + suffix, {
              ...projectArgs,
              title: 'Left',
              color: '#123456',
            })
          ).data as { id: number };
          const right = (
            await write('create_project_column' + suffix, {
              ...projectArgs,
              title: 'Right',
              color: '#abcdef',
            })
          ).data as { id: number };
          await write('update_project_column' + suffix, {
            ...projectArgs,
            column: left.id,
            title: 'Ready',
            color: '#654321',
            sorting: 2,
          });
          expect(
            (
              await call('get_project_column' + suffix, {
                ...projectArgs,
                column: left.id,
              })
            ).data,
          ).toMatchObject({ title: 'Ready', color: '#654321', sorting: 2 });
          const columns = (
            await call('list_project_columns' + suffix, projectArgs)
          ).data as { id: number }[];
          await write('reorder_project_columns' + suffix, {
            ...projectArgs,
            column_ids: columns.map((c) => c.id).reverse(),
          });
          await write('set_default_project_column' + suffix, {
            ...projectArgs,
            column: right.id,
          });
          const issue = (
            await write('create_issue', { ...base, title: 'Cross-scope card' })
          ).data as { id: number };
          await write('add_project_issue' + suffix, {
            ...projectArgs,
            column: left.id,
            issue_id: issue.id,
          });
          await write('move_project_issue' + suffix, {
            ...projectArgs,
            issue_id: issue.id,
            column_id: right.id,
            sorting: -1,
          });
          expect(
            (
              await call('list_project_column_issues' + suffix, {
                ...projectArgs,
                column: right.id,
              })
            ).data,
          ).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: issue.id })]),
          );
          await write('remove_project_issue' + suffix, {
            ...projectArgs,
            column: right.id,
            issue_id: issue.id,
          });
          await write('delete_project_column' + suffix, {
            ...projectArgs,
            column: left.id,
          });
          await write('delete_project' + suffix, projectArgs);
        } finally {
          await h.close();
        }
      },
      60000,
    );
  },
);
