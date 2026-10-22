import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { Config } from './config/index.js';
import { operations } from './tools/catalog.js';

export const VERSION = '0.4.0';

const buildSchema = z
  .object({
    version: z.string().min(1).max(50),
    commit: z.string().regex(/^([0-9a-f]{7,40}(-dirty)?|unknown)$/),
    builtAt: z.iso.datetime().nullable(),
  })
  .strict();
export type BuildInfo = z.infer<typeof buildSchema>;

/** build-info.json is written by the Docker build or the installer; a missing or invalid file is reported as unknown. */
export function loadBuildInfo(file = resolve('build-info.json')): BuildInfo {
  try {
    return buildSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return { version: VERSION, commit: 'unknown', builtAt: null };
  }
}

// Read once at startup so a later rebuild on disk never misreports the running process.
const startupBuild = loadBuildInfo();
const startedAt = new Date();

export function runtimeStatus(
  config: Config,
  build: BuildInfo = startupBuild,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, unknown> {
  return {
    mcpVersion: VERSION,
    buildVersion: build.version,
    buildCommit: build.commit,
    builtAt: build.builtAt,
    writeApprovalRequired: config.requireWriteApproval,
    approvalMode: config.requireWriteApproval ? 'browser_approval' : 'direct',
    deploymentMode:
      env.NODE_ENV === 'production' ? 'production' : 'development',
    configurationLoaded: true,
    startedAt: startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
    configuredInstances: config.instances.length,
    selfServiceServers: config.allowUserServers,
    toolCount: operations.length,
    writeToolCount: operations.filter((o) => o.write).length,
    note: config.requireWriteApproval
      ? 'Write tools return approval_required until the account owner approves the exact change in the browser.'
      : 'Write tools run directly. An approval_required response therefore cannot come from this server instance: check for another deployment or a stale container.',
  };
}

/** One log line without secrets, used to prove the effective mode with docker compose logs. */
export function startupSummary(
  config: Config,
  build: BuildInfo = startupBuild,
  env: NodeJS.ProcessEnv = process.env,
): string {
  return (
    'Gitea MCP server ready: version=' +
    VERSION +
    ' commit=' +
    build.commit +
    ' writeApproval=' +
    (config.requireWriteApproval ? 'required' : 'disabled') +
    ' mode=' +
    (env.NODE_ENV === 'production' ? 'production' : 'development')
  );
}
