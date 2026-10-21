import { z } from 'zod';
import type { Params, RegisterOperation } from './catalog.js';
import {
  base64,
  name,
  identifier as id,
  repositoryCreateFields,
  releaseEditFields,
} from './fields.js';

const enc = (v: unknown) => encodeURIComponent(String(v));
const pick = (p: Params, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => p[k] !== undefined).map((k) => [k, p[k]]),
  );
const repo = { owner: name, repo: name };
const root = (p: Params) => '/repos/' + enc(p.owner) + '/' + enc(p.repo);
const pagination = {
  page: z.number().int().min(1).max(10000).default(1),
  limit: z.number().int().min(1).max(50).default(20),
};
const component = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.+-]*$/)
  .refine((v) => !v.includes('..'));
const packageType = z.enum([
  'alpine',
  'cargo',
  'chef',
  'composer',
  'conan',
  'conda',
  'container',
  'cran',
  'debian',
  'generic',
  'go',
  'helm',
  'maven',
  'npm',
  'nuget',
  'pub',
  'pypi',
  'rpm',
  'rubygems',
  'swift',
  'terraform',
  'vagrant',
]);
const packageName = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (v) =>
      ![...v].some((c) => c.charCodeAt(0) < 32) &&
      !/[\\?#]/.test(v) &&
      !v.split('/').some((s) => !s || s === '.' || s === '..'),
  );

export function registerPublishingTools(add: RegisterOperation): void {
  const issue = { ...repo, index: id };
  const issueRoot = (p: Params) => root(p) + '/issues/' + enc(p.index);
  add(
    'lock_issue',
    'Lock further issue conversation, optionally recording a reason.',
    { ...issue, lock_reason: z.string().max(100).optional() },
    (p) => ({
      path: issueRoot(p) + '/lock',
      method: 'PUT',
      body: pick(p, ['lock_reason']),
    }),
    true,
    true,
  );
  add(
    'unlock_issue',
    'Unlock issue conversation.',
    issue,
    (p) => ({ path: issueRoot(p) + '/lock', method: 'DELETE' }),
    true,
  );
  add(
    'pin_issue',
    'Pin an issue to the repository issue list, subject to the server limit.',
    issue,
    (p) => ({ path: issueRoot(p) + '/pin', method: 'POST' }),
    true,
  );
  add(
    'unpin_issue',
    'Remove an issue pin.',
    issue,
    (p) => ({ path: issueRoot(p) + '/pin', method: 'DELETE' }),
    true,
  );
  add(
    'move_issue_pin',
    'Move an existing issue pin to the selected position.',
    { ...issue, position: z.number().int().min(0).max(100) },
    (p) => ({
      path: issueRoot(p) + '/pin/' + enc(p.position),
      method: 'PATCH',
    }),
    true,
  );
  add('list_pinned_issues', 'Read pinned repository issues.', repo, (p) => ({
    path: root(p) + '/issues/pinned',
  }));
  const dependency = {
    ...issue,
    dependency_owner: name,
    dependency_repo: name,
    dependency_index: id,
  };
  for (const [tool, method] of [
    ['add_issue_dependency', 'POST'],
    ['remove_issue_dependency', 'DELETE'],
  ] as const)
    add(
      tool,
      'Change which issue blocks this issue. The dependency uses its repository-local number.',
      dependency,
      (p) => ({
        path: issueRoot(p) + '/dependencies',
        method,
        body: {
          owner: p.dependency_owner,
          repo: p.dependency_repo,
          index: p.dependency_index,
        },
      }),
      true,
    );
  const organization = {
    username: name,
    full_name: z.string().max(200).optional(),
    description: z.string().max(2000).optional(),
    email: z.union([z.email(), z.literal('')]).optional(),
    location: z.string().max(200).optional(),
    website: z
      .union([
        z
          .url()
          .refine((v) => ['https:', 'http:'].includes(new URL(v).protocol)),
        z.literal(''),
      ])
      .optional(),
    visibility: z.enum(['public', 'limited', 'private']).default('private'),
    repo_admin_change_team_access: z.boolean().default(false),
  };
  add(
    'create_organization',
    'Create an organization as the current user; no site-admin API. Review visibility and delegated team-access setting.',
    organization,
    (p) => ({
      path: '/orgs',
      method: 'POST',
      body: pick(p, Object.keys(organization)),
    }),
    true,
  );
  add(
    'list_my_organizations',
    'List organizations accessible to the authenticated Gitea user.',
    pagination,
    (p) => ({ path: '/user/orgs', query: pick(p, ['page', 'limit']) }),
  );
  add(
    'get_organization',
    'Read an accessible organization.',
    { org: name },
    (p) => ({ path: '/orgs/' + enc(p.org) }),
  );
  add(
    'create_organization_repository',
    'Create a repository in an organization using current membership permissions.',
    { org: name, ...repositoryCreateFields },
    (p) => ({
      path: '/orgs/' + enc(p.org) + '/repos',
      method: 'POST',
      body: pick(p, Object.keys(repositoryCreateFields)),
    }),
    true,
  );
  add(
    'list_organization_repositories',
    'List repositories in an accessible organization.',
    { org: name, ...pagination },
    (p) => ({
      path: '/orgs/' + enc(p.org) + '/repos',
      query: pick(p, ['page', 'limit']),
    }),
  );

  add(
    'set_issue_deadline',
    'Set or clear an issue due date. Gitea stores only the calendar date.',
    {
      ...repo,
      index: id,
      due_date: z.iso.datetime({ offset: true }).nullable(),
    },
    (p) => ({
      path: root(p) + '/issues/' + enc(p.index) + '/deadline',
      method: 'POST',
      body: { due_date: p.due_date },
    }),
    true,
  );
  add(
    'get_milestone',
    'Read a milestone used as a sprint, including issue progress and due date. Gitea has no independent sprint endpoint.',
    { ...repo, id },
    (p) => ({ path: root(p) + '/milestones/' + enc(p.id) }),
  );
  add(
    'update_release',
    'Edit release fields or publish a draft after exact approval.',
    { ...repo, id, ...releaseEditFields },
    (p) => ({
      path: root(p) + '/releases/' + enc(p.id),
      method: 'PATCH',
      body: pick(p, Object.keys(releaseEditFields)),
    }),
    true,
    true,
  );

  const slug = z
    .string()
    .min(1)
    .max(200)
    .refine(
      (v) =>
        v !== '.' &&
        v !== '..' &&
        ![...v].some((c) => c.charCodeAt(0) < 32) &&
        !/[/\\?#]/.test(v),
    );
  const wikiFields = {
    title: z.string().min(1).max(200),
    content_base64: base64,
    message: z.string().max(2000).optional(),
  };
  const wikiPage = (p: Params) => root(p) + '/wiki/page/' + enc(p.page_name);
  add(
    'list_wiki_pages',
    'List repository wiki pages as untrusted data.',
    { ...repo, ...pagination },
    (p) => ({
      path: root(p) + '/wiki/pages',
      query: pick(p, ['page', 'limit']),
    }),
  );
  add(
    'get_wiki_page',
    'Read a wiki page; use the returned sub_url slug, not an assumed title encoding.',
    { ...repo, page_name: slug },
    (p) => ({ path: wikiPage(p) }),
  );
  add(
    'list_wiki_revisions',
    'Read wiki page revision history.',
    { ...repo, page_name: slug, ...pagination },
    (p) => ({
      path: root(p) + '/wiki/revisions/' + enc(p.page_name),
      query: pick(p, ['page', 'limit']),
    }),
  );
  add(
    'create_wiki_page',
    'Create a wiki page with base64 content and an optional commit message. Wiki must be enabled.',
    { ...repo, ...wikiFields },
    (p) => ({
      path: root(p) + '/wiki/new',
      method: 'POST',
      body: pick(p, Object.keys(wikiFields)),
    }),
    true,
  );
  add(
    'update_wiki_page',
    'Replace wiki content or rename the page. Read current content and inspect the full replacement before approval.',
    {
      ...repo,
      page_name: slug,
      title: wikiFields.title.optional(),
      content_base64: base64.optional(),
      message: wikiFields.message,
    },
    (p) => ({
      path: wikiPage(p),
      method: 'PATCH',
      body: pick(p, Object.keys(wikiFields)),
    }),
    true,
    true,
  );
  add(
    'delete_wiki_page',
    'Delete one wiki page after inspecting its current content.',
    { ...repo, page_name: slug },
    (p) => ({ path: wikiPage(p), method: 'DELETE' }),
    true,
    true,
  );

  const packageTarget = { owner: name, type: packageType, name: packageName };
  const packageRoot = (p: Params) =>
    '/packages/' + enc(p.owner) + '/' + enc(p.type) + '/' + enc(p.name);
  const version = z
    .string()
    .min(1)
    .max(200)
    .refine(
      (v) =>
        v !== '.' &&
        v !== '..' &&
        ![...v].some((c) => c.charCodeAt(0) < 32) &&
        !/[/\\?#]/.test(v),
    );
  add(
    'list_packages',
    'List packages of an accessible user or organization, optionally filtering type and name.',
    {
      owner: name,
      ...pagination,
      type: packageType.optional(),
      q: z.string().max(200).optional(),
    },
    (p) => ({
      path: '/packages/' + enc(p.owner),
      query: pick(p, ['page', 'limit', 'type', 'q']),
    }),
  );
  add(
    'list_package_versions',
    'List published versions of one package.',
    { ...packageTarget, ...pagination },
    (p) => ({ path: packageRoot(p), query: pick(p, ['page', 'limit']) }),
  );
  add(
    'get_package',
    'Read package version metadata.',
    { ...packageTarget, version },
    (p) => ({ path: packageRoot(p) + '/' + enc(p.version) }),
  );
  add(
    'list_package_files',
    'Read file metadata and hashes for a package version.',
    { ...packageTarget, version },
    (p) => ({ path: packageRoot(p) + '/' + enc(p.version) + '/files' }),
  );
  add(
    'upload_generic_package',
    'Publish one small generic package file (up to 750000 decoded bytes). Existing files are not silently overwritten; use native registry clients for other formats/large files.',
    {
      owner: name,
      name: component,
      version: component,
      file_name: component,
      content_base64: base64,
    },
    (p) => ({
      path:
        '/' +
        enc(p.owner) +
        '/generic/' +
        enc(p.name) +
        '/' +
        enc(p.version) +
        '/' +
        enc(p.file_name),
      method: 'PUT',
      registry: 'generic-upload',
      rawBody: Buffer.from(String(p.content_base64), 'base64'),
    }),
    true,
  );
  add(
    'delete_package_version',
    'Delete exactly one package version and all its files. This can break dependents.',
    { ...packageTarget, version },
    (p) => ({ path: packageRoot(p) + '/' + enc(p.version), method: 'DELETE' }),
    true,
    true,
  );
  add(
    'link_package_repository',
    'Link package metadata to a repository of the same owner; does not publish package content.',
    { ...packageTarget, repo: name },
    (p) => ({
      path: packageRoot(p) + '/-/link/' + enc(p.repo),
      method: 'POST',
    }),
    true,
  );
  add(
    'unlink_package_repository',
    'Remove the package-to-repository metadata link.',
    packageTarget,
    (p) => ({ path: packageRoot(p) + '/-/unlink', method: 'POST' }),
    true,
    true,
  );
}
