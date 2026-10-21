import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  publicServerUrl,
  publicServerRequest,
} from '../../apps/mcp-server/src/security/public-server.js';

it.each([
  'http://git.example.org',
  'https://user:password@git.example.org',
  'https://git.example.org?token=secret',
  'https://git.example.org#fragment',
  'https://git.example.org:3000',
  'https://localhost',
  'https://host.local',
  'https://host.internal',
  'https://127.0.0.1',
  'https://10.0.0.1',
  'https://169.254.169.254',
  'https://[::1]',
  'https://[::ffff:127.0.0.1]',
])('denies unsafe self-service target %s', (url) =>
  expect(publicServerUrl.safeParse(url).success).toBe(false),
);

it('accepts public HTTPS subpath installations and represents the tool input as JSON Schema', () => {
  expect(publicServerUrl.safeParse('invalid URL').success).toBe(false);
  expect(z.toJSONSchema(publicServerUrl).type).toBe('string');
  expect(
    publicServerUrl.safeParse('https://git.example.org/gitea/').success,
  ).toBe(true);
});

it.each(['10.1.2.3', '127.0.0.1', '169.254.169.254', 'fc00::1'])(
  'pins DNS and rejects rebinding into %s without operator CIDR exceptions',
  async (address) => {
    const lookup = vi
      .fn()
      .mockResolvedValue([{ address, family: address.includes(':') ? 6 : 4 }]);
    const request = publicServerRequest('https://git.example.org', lookup);
    await expect(
      request(new URL('https://git.example.org/api/v1/user'), 'GET', {}),
    ).rejects.toThrow('NETWORK_ADDRESS_DENIED');
  },
);
