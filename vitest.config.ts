import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: [
        'apps/mcp-server/src/security/**/*.ts',
        'apps/mcp-server/src/auth/**/*.ts',
        'apps/mcp-server/src/gitea/**/*.ts',
        'apps/mcp-server/src/tools/service.ts',
        'apps/mcp-server/src/config/**/*.ts',
        'apps/mcp-server/src/mcp/**/*.ts',
        'apps/mcp-server/src/runtime.ts',
      ],
      reporter: ['text', 'json-summary', 'html'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 85 },
    },
    reporters: ['default', ['junit', { outputFile: 'reports/junit.xml' }]],
  },
});
