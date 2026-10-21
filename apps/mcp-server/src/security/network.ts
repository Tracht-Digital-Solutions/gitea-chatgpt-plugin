import https from 'node:https';
import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { SafeError } from './errors.js';

export type HttpResult = {
  status: number;
  headers: Record<string, string>;
  body: string;
};
export type Requester = (
  url: URL,
  method: string,
  headers: Record<string, string>,
  body?: string | Buffer,
) => Promise<HttpResult>;

export function isAllowedAddress(
  address: string,
  privateCidrs: string[] = [],
): boolean {
  try {
    const ip = ipaddr.process(address);
    if (ip.range() === 'unicast') return true;
    return privateCidrs.some((cidr) => {
      const [network, bits] = ipaddr.parseCIDR(cidr);
      return ip.kind() === network.kind() && ip.match(network, bits);
    });
  } catch {
    return false;
  }
}

/** Resolve once and pin the validated address to the TLS socket. Redirects are never followed. */
export function secureRequester(
  allowedBases: string[],
  privateCidrs: string[] = [],
  lookup = dns.lookup,
): Requester {
  const bases = allowedBases.map((s) => new URL(s));
  return async (url, method, headers, body) => {
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hash ||
      !bases.some(
        (b) =>
          url.origin === b.origin &&
          (url.pathname === b.pathname ||
            url.pathname.startsWith(b.pathname.replace(/\/$/, '') + '/')),
      )
    )
      throw new SafeError('NETWORK_TARGET_DENIED', 403);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const addresses = ipaddr.isValid(host)
      ? [
          {
            address: host,
            family: ipaddr.parse(host).kind() === 'ipv4' ? 4 : 6,
          },
        ]
      : await lookup(host, { all: true, verbatim: true });
    if (
      !addresses.length ||
      addresses.some((a) => !isAllowedAddress(a.address, privateCidrs))
    )
      throw new SafeError('NETWORK_ADDRESS_DENIED', 403);
    const address = addresses[0]!;
    return new Promise<HttpResult>((resolve, reject) => {
      const req = https.request(
        url,
        {
          method,
          headers,
          agent: false,
          lookup: (_host, options, callback) => {
            if (typeof options === 'object' && options.all)
              callback(null, [address]);
            else callback(null, address.address, address.family);
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > 2 * 1024 * 1024) {
              req.destroy(new SafeError('RESPONSE_TOO_LARGE', 502));
            } else chunks.push(chunk);
          });
          res.on('error', () => reject(new SafeError('NETWORK_ERROR', 502)));
          res.on('end', () => {
            const status = res.statusCode ?? 502;
            if (status >= 300 && status < 400) {
              reject(new SafeError('REDIRECT_DENIED', 502));
              return;
            }
            const out: Record<string, string> = {};
            for (const [key, value] of Object.entries(res.headers))
              if (typeof value === 'string') out[key] = value;
            resolve({
              status,
              headers: out,
              body: Buffer.concat(chunks).toString('utf8'),
            });
          });
        },
      );
      const timer = setTimeout(
        () => req.destroy(new SafeError('NETWORK_TIMEOUT', 504)),
        15000,
      );
      req.on('error', (err) =>
        reject(
          err instanceof SafeError ? err : new SafeError('NETWORK_ERROR', 502),
        ),
      );
      req.on('close', () => clearTimeout(timer));
      if (body) req.write(body);
      req.end();
    });
  };
}
