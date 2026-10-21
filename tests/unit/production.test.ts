import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('starts native production dependencies in production mode despite an inherited development environment', () => {
  const output = execFileSync(
    process.execPath,
    [
      '--import',
      './scripts/production.mjs',
      '--input-type=module',
      '-e',
      "import express from 'express'; console.log(express().get('env'))",
    ],
    { env: { ...process.env, NODE_ENV: 'development' }, encoding: 'utf8' },
  );
  expect(output.trim()).toBe('production');
});
