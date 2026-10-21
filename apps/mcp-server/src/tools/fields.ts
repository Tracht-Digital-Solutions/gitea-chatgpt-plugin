import { z } from 'zod';

export const name = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/)
  .refine((v) => !v.includes('..'));
export const identifier = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
export const timestamp = z.iso.datetime({ offset: true });
export const gitRef = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (s) =>
      !s.includes('..') &&
      !/[\s~^:?*[\\]/.test(s) &&
      !s.startsWith('/') &&
      !s.endsWith('/') &&
      !s.includes('//') &&
      !s.endsWith('.lock'),
  );
export const base64 = z
  .string()
  .max(1000000)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
export const repositoryCreateFields = {
  name,
  description: z.string().max(2000).optional(),
  private: z.boolean().default(true),
  auto_init: z.boolean().default(true),
  default_branch: gitRef.optional(),
  gitignores: z.string().max(1000).optional(),
  issue_labels: z.string().max(100).optional(),
  license: z.string().max(100).optional(),
  readme: z.string().max(100).optional(),
  template: z.boolean().optional(),
  trust_model: z
    .enum(['default', 'collaborator', 'committer', 'collaboratorcommitter'])
    .optional(),
  object_format_name: z.enum(['sha1', 'sha256']).optional(),
};
export const issueCreateFields = {
  title: z.string().min(1).max(255),
  body: z.string().max(65536).optional(),
  assignee: name
    .optional()
    .describe('Deprecated Gitea compatibility field; prefer assignees.'),
  assignees: z.array(name).max(20).optional(),
  labels: z.array(identifier).max(30).optional(),
  milestone: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  projects: z.array(identifier).max(30).optional(),
  closed: z.boolean().optional(),
  due_date: timestamp.optional(),
  ref: z.union([gitRef, z.literal('')]).optional(),
};
export const issueEditFields = {
  title: issueCreateFields.title.optional(),
  body: issueCreateFields.body,
  assignee: issueCreateFields.assignee,
  assignees: issueCreateFields.assignees,
  milestone: issueCreateFields.milestone,
  projects: issueCreateFields.projects,
  due_date: issueCreateFields.due_date,
  ref: issueCreateFields.ref,
  state: z.enum(['open', 'closed']).optional(),
  content_version: z
    .number()
    .int()
    .min(0)
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  unset_due_date: z.boolean().optional(),
};
export const releaseEditFields = {
  tag_name: gitRef.optional(),
  target_commitish: gitRef.optional(),
  name: z.string().max(255).optional(),
  body: z.string().max(65536).optional(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
};

export const actionRunFilters = {
  event: z.string().min(1).max(100).optional(),
  branch: gitRef.optional(),
  status: z
    .enum([
      'requested',
      'pending',
      'queued',
      'in_progress',
      'failure',
      'success',
      'skipped',
    ])
    .optional(),
  actor: name.optional(),
  head_sha: z
    .string()
    .regex(/^[a-f0-9]{40,64}$/)
    .optional(),
  exclude_pull_requests: z.boolean().optional(),
};
