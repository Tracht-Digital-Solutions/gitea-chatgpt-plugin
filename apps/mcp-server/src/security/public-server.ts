import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { z } from 'zod';
import { isAllowedAddress, secureRequester } from './network.js';

// User-selected servers never inherit operator exceptions for private networks.
export const publicServerUrl = z
  .string()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        (!url.port || url.port === '443') &&
        (ipaddr.isValid(host)
          ? isAllowedAddress(host)
          : host.includes('.') &&
            !/\.(localhost|local|internal)\.?$/i.test(host))
      );
    } catch {
      return false;
    }
  }, 'Public HTTPS Gitea server on port 443 required');

export const publicServerRequest = (base: string, lookup = dns.lookup) =>
  secureRequester([publicServerUrl.parse(base)], [], lookup);
