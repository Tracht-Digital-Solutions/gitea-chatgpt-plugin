import { describe, it, expect, vi, afterEach } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import {
  isAllowedAddress,
  secureRequester,
} from '../../apps/mcp-server/src/security/network.js';
import type { LookupAddress } from 'node:dns';
import type { IncomingMessage, ClientRequest } from 'node:http';
import type { LookupFunction } from 'node:net';
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('SSRF and rebinding protection', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.1.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '224.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    'bad-address',
  ])('rejects unsafe address %s', (address) => {
    expect(isAllowedAddress(address)).toBe(false);
  });
  it('allows public IPs and explicitly approved private CIDRs', () => {
    expect(isAllowedAddress('8.8.8.8')).toBe(true);
    expect(isAllowedAddress('2606:4700:4700::1111')).toBe(true);
    expect(isAllowedAddress('10.1.2.3', ['10.0.0.0/8'])).toBe(true);
    expect(isAllowedAddress('10.1.2.3', ['192.168.0.0/16'])).toBe(false);
    expect(isAllowedAddress('10.1.2.3', ['bad'])).toBe(false);
  });
  const lookup = (addresses: LookupAddress[]) =>
    vi.fn().mockResolvedValue(addresses);
  it('refuses unapproved origins, non-HTTPS, credentials and path-prefix tricks before DNS', async () => {
    const dns = lookup([{ address: '8.8.8.8', family: 4 }]);
    const request = secureRequester(['https://git.example.org/gitea'], [], dns);
    for (const url of [
      'http://git.example.org/gitea',
      'https://evil.example.org/gitea',
      'https://git.example.org/gitea-evil',
      'https://user:pass@git.example.org/gitea',
      'https://git.example.org/gitea#x',
    ])
      await expect(request(new URL(url), 'GET', {})).rejects.toThrow(
        'NETWORK_TARGET_DENIED',
      );
    expect(dns).not.toHaveBeenCalled();
  });
  it('rejects mixed public/private DNS answers, empty answers and private literal IPs', async () => {
    for (const addresses of [
      [],
      [{ address: '127.0.0.1', family: 4 }],
      [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
    ])
      await expect(
        secureRequester(['https://git.example.org'], [], lookup(addresses))(
          new URL('https://git.example.org/api/v1/user'),
          'GET',
          {},
        ),
      ).rejects.toThrow('NETWORK_ADDRESS_DENIED');
    await expect(
      secureRequester(['https://127.0.0.1'])(
        new URL('https://127.0.0.1/api/v1/user'),
        'GET',
        {},
      ),
    ).rejects.toThrow('NETWORK_ADDRESS_DENIED');
  });
  function socket(
    status: number,
    body: string,
    options: {
      error?: boolean;
      responseError?: boolean;
      timeout?: boolean;
    } = {},
  ) {
    const req = new EventEmitter() as ClientRequest;
    req.write = vi.fn();
    req.end = vi.fn(() => {
      if (options.timeout) return req;
      queueMicrotask(() => {
        if (options.error) {
          req.emit('error', new Error('secret'));
          req.emit('close');
          return;
        }
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = status;
        res.headers = {
          'content-type': 'text/plain',
          'set-cookie': ['secret'],
        };
        callback!(res);
        if (options.responseError) res.emit('error', new Error('secret'));
        else {
          res.emit('data', Buffer.from(body));
          res.emit('end');
        }
        req.emit('close');
      });
      return req;
    });
    req.destroy = vi.fn((error?: Error) => {
      req.emit('error', error);
      req.emit('close');
      return req;
    });
    let callback: ((res: IncomingMessage) => void) | undefined;
    vi.spyOn(https, 'request').mockImplementation(((
      url: URL,
      opts: https.RequestOptions,
      cb: (res: IncomingMessage) => void,
    ) => {
      callback = cb;
      const pin = opts.lookup as LookupFunction;
      pin('rebound.example', { all: false }, (error, address, family) => {
        expect(error).toBeNull();
        expect(address).toBe('8.8.8.8');
        expect(family).toBe(4);
      });
      pin('rebound.example', { all: true }, (error, addresses) => {
        expect(error).toBeNull();
        expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
      });
      expect(url.hostname).toBe('git.example.org');
      expect(opts.agent).toBe(false);
      return req;
    }) as typeof https.request);
    return req;
  }
  it('pins validated addresses at socket connect time and returns bounded responses', async () => {
    const req = socket(200, 'ok');
    const dns = lookup([{ address: '8.8.8.8', family: 4 }]);
    const result = await secureRequester(['https://git.example.org'], [], dns)(
      new URL('https://git.example.org/api/v1/user'),
      'POST',
      {},
      '{}',
    );
    expect(result.body).toBe('ok');
    expect(result.headers).toEqual({ 'content-type': 'text/plain' });
    expect(req.write).toHaveBeenCalledWith('{}');
    expect(dns).toHaveBeenCalledTimes(1);
  });
  it('denies redirects without a second request', async () => {
    socket(302, '');
    await expect(
      secureRequester(
        ['https://git.example.org'],
        [],
        lookup([{ address: '8.8.8.8', family: 4 }]),
      )(new URL('https://git.example.org/x'), 'GET', {}),
    ).rejects.toThrow('REDIRECT_DENIED');
    expect(https.request).toHaveBeenCalledTimes(1);
  });
  it('bounds response size', async () => {
    socket(200, 'x'.repeat(2 * 1024 * 1024 + 1));
    await expect(
      secureRequester(
        ['https://git.example.org'],
        [],
        lookup([{ address: '8.8.8.8', family: 4 }]),
      )(new URL('https://git.example.org/x'), 'GET', {}),
    ).rejects.toThrow('RESPONSE_TOO_LARGE');
  });
  it.each(['error', 'responseError'] as const)(
    'sanitizes %s',
    async (error) => {
      socket(200, '', { [error]: true });
      await expect(
        secureRequester(
          ['https://git.example.org'],
          [],
          lookup([{ address: '8.8.8.8', family: 4 }]),
        )(new URL('https://git.example.org/x'), 'GET', {}),
      ).rejects.toThrow('NETWORK_ERROR');
    },
  );
  it('enforces a total request timeout', async () => {
    vi.useFakeTimers();
    socket(200, '', { timeout: true });
    const promise = secureRequester(
      ['https://git.example.org'],
      [],
      lookup([{ address: '8.8.8.8', family: 4 }]),
    )(new URL('https://git.example.org/x'), 'GET', {});
    const assertion = expect(promise).rejects.toThrow('NETWORK_TIMEOUT');
    await vi.advanceTimersByTimeAsync(15001);
    await assertion;
  });
});
