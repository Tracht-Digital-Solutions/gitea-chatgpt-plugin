import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { realHarness } from './harness.js';

describe.skipIf(!process.env.GITEA_E2E_URL || !process.env.GITEA_E2E_TOKEN)(
  'real Gitea field and publishing matrix',
  () => {
    it('persists issue/project fields, organizations, repositories, milestones, releases, wiki and binary packages', async () => {
      const h = await realHarness();
      const { call, write } = h;
      try {
        expect((await call('get_authenticated_user')).data).toHaveProperty(
          'is_admin',
          false,
        );
        const org = 'mcp-org-matrix';
        const createdOrg = (
          await write('create_organization', {
            username: org,
            full_name: 'Matrix Organization',
            description: 'isolated fixture',
            email: 'matrix@example.invalid',
            location: 'Berlin',
            website: 'https://example.org',
            visibility: 'private',
            repo_admin_change_team_access: false,
          })
        ).data;
        expect(createdOrg).toMatchObject({
          name: org,
          full_name: 'Matrix Organization',
          description: 'isolated fixture',
          visibility: 'private',
          location: 'Berlin',
          website: 'https://example.org',
          repo_admin_change_team_access: false,
        });
        expect((await call('get_organization', { org })).data).toMatchObject({
          full_name: 'Matrix Organization',
        });
        const repo = 'field-matrix';
        const base = { owner: org, repo };
        const repository = (
          await write('create_organization_repository', {
            org,
            name: repo,
            private: true,
            auto_init: true,
            description: 'all create fields',
            default_branch: 'trunk',
            gitignores: 'Go',
            issue_labels: 'Default',
            license: 'Apache-2.0',
            readme: 'Default',
            template: true,
            trust_model: 'collaborator',
            object_format_name: 'sha1',
          })
        ).data;
        expect(repository).toMatchObject({
          name: repo,
          private: true,
          default_branch: 'trunk',
          description: 'all create fields',
          template: true,
          object_format_name: 'sha1',
        });
        for (const path of ['.gitignore', 'LICENSE', 'README.md'])
          expect(
            (await call('read_file', { ...base, path })).data,
          ).toHaveProperty('content');
        expect(
          (await call('list_organization_repositories', { org })).data,
        ).toEqual(
          expect.arrayContaining([expect.objectContaining({ name: repo })]),
        );
        const label = (
          await write('create_label', {
            ...base,
            name: 'Matrix',
            color: '123456',
          })
        ).data as { id: number };
        const sprint = (
          await write('create_milestone', {
            ...base,
            title: 'Sprint 7',
            description: 'Sprint scope',
            state: 'open',
            due_on: '2026-11-20T00:00:00Z',
          })
        ).data as { id: number };
        expect(
          (await call('get_milestone', { ...base, id: sprint.id })).data,
        ).toMatchObject({ title: 'Sprint 7', state: 'open' });
        const project = (
          await write('create_project', {
            ...base,
            title: 'Matrix',
            description: 'board description',
            card_type: 'text_only',
            template_type: 'none',
          })
        ).data as { id: number };
        const ticket = (
          await write('create_issue', {
            ...base,
            title: 'All fields',
            body: 'Initial body',
            assignee: 'e2e',
            assignees: ['e2e'],
            labels: [label.id],
            milestone: sprint.id,
            projects: [project.id],
            closed: true,
            due_date: '2026-11-10T12:00:00Z',
            ref: 'trunk',
          })
        ).data as { number: number; content_version: number };
        const issueArgs = { ...base, index: ticket.number };
        const read = (await call('get_issue', issueArgs)).data as {
          content_version: number;
        };
        expect(read).toMatchObject({
          title: 'All fields',
          body: 'Initial body',
          state: 'closed',
          ref: 'trunk',
          milestone: { id: sprint.id },
          labels: expect.arrayContaining([
            expect.objectContaining({ id: label.id }),
          ]),
          assignees: expect.arrayContaining([
            expect.objectContaining({ login: 'e2e' }),
          ]),
          projects: expect.arrayContaining([
            expect.objectContaining({ id: project.id }),
          ]),
        });
        expect(read).toHaveProperty(
          'due_date',
          expect.stringContaining('2026-11-10'),
        );
        await write('update_issue', {
          ...issueArgs,
          title: 'Edited fields',
          body: '',
          state: 'open',
          assignee: 'e2e',
          assignees: ['e2e'],
          milestone: 0,
          projects: [],
          ref: '',
          due_date: '2026-11-12T00:00:00Z',
          unset_due_date: false,
          content_version: read.content_version,
        });
        const edited = (await call('get_issue', issueArgs)).data;
        expect(edited).toMatchObject({
          title: 'Edited fields',
          body: '',
          state: 'open',
          ref: '',
          milestone: null,
          projects: null,
        });
        expect(edited).toHaveProperty(
          'due_date',
          expect.stringContaining('2026-11-12'),
        );
        await h.deniedWrite(
          'update_issue',
          {
            ...issueArgs,
            title: 'Stale overwrite',
            content_version: read.content_version,
          },
          'ISSUE_CHANGED_OR_VERSION_UNSUPPORTED',
        );
        await write('update_issue', {
          ...issueArgs,
          assignees: [],
          unset_due_date: true,
        });
        expect((await call('get_issue', issueArgs)).data).toMatchObject({
          assignees: null,
          due_date: null,
        });
        await write('set_issue_labels', { ...issueArgs, labels: [] });
        await write('set_issue_deadline', {
          ...issueArgs,
          due_date: '2026-11-15T00:00:00Z',
        });
        await write('set_issue_deadline', { ...issueArgs, due_date: null });
        await write('lock_issue', { ...issueArgs, lock_reason: 'resolved' });
        expect((await call('get_issue', issueArgs)).data).toHaveProperty(
          'is_locked',
          true,
        );
        await write('unlock_issue', issueArgs);
        await write('pin_issue', issueArgs);
        expect((await call('list_pinned_issues', base)).data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ number: ticket.number }),
          ]),
        );
        await write('unpin_issue', issueArgs);
        await write('update_milestone', {
          ...base,
          id: sprint.id,
          state: 'closed',
        });
        expect(
          (await call('get_milestone', { ...base, id: sprint.id })).data,
        ).toHaveProperty('state', 'closed');

        await write('create_wiki_page', {
          ...base,
          title: 'Home',
          content_base64: Buffer.from('# Matrix wiki\n').toString('base64'),
          message: 'docs: create home',
        });
        expect(
          (await call('get_wiki_page', { ...base, page_name: 'Home' })).data,
        ).toHaveProperty(
          'content_base64',
          Buffer.from('# Matrix wiki\n').toString('base64'),
        );
        await write('update_wiki_page', {
          ...base,
          page_name: 'Home',
          title: 'Home',
          content_base64: Buffer.from('# Updated\n').toString('base64'),
          message: 'docs: update home',
        });
        expect(
          (await call('get_wiki_page', { ...base, page_name: 'Home' })).data,
        ).toHaveProperty(
          'content_base64',
          Buffer.from('# Updated\n').toString('base64'),
        );
        expect((await call('list_wiki_pages', base)).data).toEqual(
          expect.arrayContaining([expect.objectContaining({ title: 'Home' })]),
        );
        await write('delete_wiki_page', { ...base, page_name: 'Home' });

        const bytes = Buffer.from([0, 1, 2, 127, 128, 254, 255]);
        const pkg = { owner: org, name: 'matrix-package', version: '1.0.0' };
        await write('upload_generic_package', {
          ...pkg,
          file_name: 'sample.bin',
          content_base64: bytes.toString('base64'),
        });
        const packageTarget = { ...pkg, type: 'generic' };
        expect((await call('get_package', packageTarget)).data).toMatchObject({
          name: pkg.name,
          version: '1.0.0',
        });
        expect((await call('list_package_files', packageTarget)).data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: 'sample.bin',
              size: bytes.length,
              sha256: createHash('sha256').update(bytes).digest('hex'),
            }),
          ]),
        );
        await write('link_package_repository', {
          owner: org,
          type: 'generic',
          name: pkg.name,
          repo,
        });
        await write('unlink_package_repository', {
          owner: org,
          type: 'generic',
          name: pkg.name,
        });
        await write('delete_package_version', packageTarget);
        const release = (
          await write('create_release', {
            ...base,
            tag_name: 'v0.0.1-matrix',
            target_commitish: 'trunk',
            name: 'Matrix draft',
            body: 'Initial release',
            draft: true,
            prerelease: true,
            tag_message: 'Matrix tag',
          })
        ).data as { id: number };
        await write('update_release', {
          ...base,
          id: release.id,
          tag_name: 'v0.0.1-matrix',
          target_commitish: 'trunk',
          name: 'Matrix published',
          body: 'Updated notes',
          draft: false,
          prerelease: false,
        });
        expect(
          (await call('get_release', { ...base, id: release.id })).data,
        ).toMatchObject({
          name: 'Matrix published',
          body: 'Updated notes',
          draft: false,
          prerelease: false,
          tag_name: 'v0.0.1-matrix',
        });
      } finally {
        await h.close();
      }
    }, 90000);
  },
);
