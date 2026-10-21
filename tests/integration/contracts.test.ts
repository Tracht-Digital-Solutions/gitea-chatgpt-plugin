import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { z } from 'zod';
import { operations } from '../../apps/mcp-server/src/tools/catalog.js';
type JsonSchema = {
  type?: string;
  enum?: unknown[];
  const?: unknown;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  default?: unknown;
  minimum?: number;
  minItems?: number;
  items?: JsonSchema;
};
const api = JSON.parse(
  readFileSync('docs/research/gitea-openapi.json', 'utf8'),
) as {
  paths: Record<
    string,
    Record<
      string,
      { requestBody?: { content: { 'application/json': { schema: object } } } }
    >
  >;
  components: object;
};
const ajv = new Ajv2020({ strict: false, validateFormats: false });
function sample(schema: JsonSchema, key = ''): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum) return schema.enum[0];
  if (schema.default !== undefined) return schema.default;
  if (schema.type === 'object')
    return Object.fromEntries(
      (schema.required ?? []).map((k) => [
        k,
        sample(schema.properties![k]!, k),
      ]),
    );
  if (schema.type === 'integer' || schema.type === 'number')
    return Math.max(1, schema.minimum ?? 1);
  if (schema.type === 'boolean') return false;
  if (schema.type === 'array')
    return Array.from({ length: schema.minItems ?? 0 }, () =>
      sample(schema.items ?? {}),
    );
  if (['sha', 'head_commit_id', 'commit_id'].includes(key))
    return 'a'.repeat(40);
  if (key === 'content') return 'aGk=';
  if (key === 'color') return 'abcdef';
  if (key === 'due_on') return '2026-10-21T12:00:00Z';
  if (key === 'path') return 'file.txt';
  if (key === 'approvalId') return 'a'.repeat(48);
  return 'test';
}
describe('Gitea OpenAPI contract for every direct tool operation', () => {
  it.each(operations.filter((o) => o.request).map((o) => [o.name, o] as const))(
    '%s uses an existing method/path and valid required body',
    (_name, operation) => {
      const input = operation.schema.parse(
        sample(z.toJSONSchema(operation.schema) as JsonSchema),
      ) as Record<string, unknown>;
      const request = operation.request!(input);
      const method = (request.method ?? 'GET').toLowerCase();
      const contract = Object.entries(api.paths).find(
        ([path, methods]) =>
          methods[method] &&
          new RegExp(
            '^' +
              path
                .replace(/[.*+?^$()|[\]\\]/g, '\\$&')
                .replace(/\{[^}]+\}/g, '[^/]+') +
              '$',
          ).test(request.path),
      );
      expect(contract, 'Missing path: ' + request.path).toBeDefined();
      const definition = contract![1][method];
      expect(definition, 'Missing method ' + method).toBeDefined();
      const schema =
        definition!.requestBody?.content['application/json'].schema;
      if (schema) {
        const validate = ajv.compile({ ...schema, components: api.components });
        expect(validate(request.body), JSON.stringify(validate.errors)).toBe(
          true,
        );
      }
    },
  );
});
