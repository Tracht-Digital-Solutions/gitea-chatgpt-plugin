import { readFileSync } from 'node:fs';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { z } from 'zod';
import addFormats from 'ajv-formats';
import { operations } from '../apps/mcp-server/src/tools/catalog.js';
const json = (path: string) =>
  JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats.default(ajv);
const manifest = json('plugin/plugin.json');
const mcp = json('plugin/mcp.json');
const pluginValidator = ajv.compile(json('docs/research/plugin.schema.json'));
if (!pluginValidator(manifest))
  throw new Error(JSON.stringify(pluginValidator.errors));
// The base 1.0 schema predates OpenAI server extensions. Validate transport and extension independently.
const servers = mcp.mcpServers as Record<string, Record<string, unknown>>;
const stripped = {
  ...mcp,
  mcpServers: Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [
      name,
      Object.fromEntries(
        Object.entries(server).filter(([key]) => key !== 'extensions'),
      ),
    ]),
  ),
};
const mcpValidator = ajv.compile(json('docs/research/mcp.schema.json'));
if (!mcpValidator(stripped))
  throw new Error(JSON.stringify(mcpValidator.errors));
const ext = z.object({
  'com.openai': z.object({
    urlTemplates: z
      .array(z.string().regex(/^https:\/\/\{[A-Za-z][A-Za-z0-9_]*\}\/mcp$/))
      .optional(),
    auth: z.object({
      type: z.literal('oauth'),
      client: z.object({
        mode: z.literal('provided'),
        clientId: z.string().min(1),
        tokenEndpointAuthMethod: z.literal('none'),
      }),
      baseScopes: z.array(z.string()),
      defaultScopes: z.array(z.string()),
    }),
  }),
});
for (const server of Object.values(servers)) {
  ext.parse(server.extensions);
  if (typeof server.url !== 'string' || !server.url.startsWith('https://'))
    throw new Error('HTTPS endpoint required');
}
const pkg = json('package.json');
if (pkg.version !== manifest.version) throw new Error('Version drift');
const presentation = (
  manifest.extensions as {
    'com.openai': { interface: { shortDescription: string; logo: string } };
  }
)['com.openai'].interface;
if (presentation.shortDescription.length > 30)
  throw new Error('Subtitle exceeds 30 characters');
if (
  !presentation.logo.startsWith('./assets/') ||
  presentation.logo.includes('..')
)
  throw new Error('Unsafe asset path');
readFileSync('plugin/' + presentation.logo);
if (new Set(operations.map((o) => o.name)).size !== operations.length)
  throw new Error('Duplicate tool');
for (const op of operations) {
  const schema = z.toJSONSchema(op.schema, { target: 'draft-2020-12' });
  ajv.compile(schema);
  if (op.destructive && !op.write) throw new Error('Invalid tool annotation');
}
process.stdout.write(
  `${operations.length} MCP tool schemas, portable manifest, transport and OpenAI extensions validated.\n`,
);
