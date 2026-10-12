import { lookup as dnsLookup } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import zlib from "node:zlib";

const USER_AGENT =
  "Touchpoint (+https://github.com/priyanshu-programs/Touchpoint)";
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_REDIRECTS = 3;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

// Everything that is not the public internet: this machine, private networks,
// link-local (which holds cloud metadata endpoints), and ranges that route nowhere.
const notPublic = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  notPublic.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  // These three carry an IPv4 address inside them, so they could reach a private one.
  ["64:ff9b::", 96],
  ["2001::", 32],
  ["2002::", 16],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  notPublic.addSubnet(network, prefix, "ipv6");
}

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return false;
  // IPv4 rules also match the IPv4-mapped form (::ffff:10.0.0.1).
  return !notPublic.check(address, family === 6 ? "ipv6" : "ipv4");
}

export type FetchErrorCode = "blocked" | "unreachable" | "timeout";

export class FetchError extends Error {
  constructor(readonly code: FetchErrorCode) {
    super(`Fetch failed: ${code}`);
  }
}

export type FetchOptions = {
  // Reading stops here; the result says whether anything was cut off.
  maxBytes: number;
  // An instant (ms since epoch) by which the whole call must be over.
  deadline: number;
  accept?: string;
  // For a server known to answer slowly; the deadline still applies.
  timeoutMs?: number;
};
export type FetchResult = {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  truncated: boolean;
};
export type Fetcher = (
  url: string,
  options: FetchOptions,
) => Promise<FetchResult>;

type Allow = (address: string, port: number) => boolean;

// The check sits in the socket's own lookup, so the address that was checked is the
// address connected to. Checking before the request would leave a gap for a second,
// different DNS answer.
function guardedLookup(allow: Allow, port: number): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      if (addresses.some(({ address }) => !allow(address, port))) {
        return callback(new FetchError("blocked"), "", 0);
      }
      if (options.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function decoded(response: http.IncomingMessage): Readable {
  const encoding = response.headers["content-encoding"]?.trim().toLowerCase();
  const decoder =
    encoding === "gzip" || encoding === "x-gzip"
      ? zlib.createGunzip()
      : encoding === "br"
        ? zlib.createBrotliDecompress()
        : encoding === "deflate"
          ? zlib.createInflate()
          : null;
  // Stopping early at the size cap ends the pipeline with an error nobody needs.
  return decoder ? pipeline(response, decoder, () => {}) : response;
}

// Returns the response, or the address a redirect points to.
async function requestOnce(
  url: URL,
  options: FetchOptions,
  allow: Allow,
): Promise<FetchResult | URL> {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchError("blocked");
  }
  if (url.username || url.password) throw new FetchError("blocked");
  const secure = url.protocol === "https:";
  const port = url.port ? Number(url.port) : secure ? 443 : 80;
  // An address typed as the host never goes through a lookup.
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0 && !allow(host, port)) throw new FetchError("blocked");

  const remaining = options.deadline - Date.now();
  if (remaining <= 0) throw new FetchError("timeout");

  const response = await new Promise<http.IncomingMessage>(
    (resolve, reject) => {
      const request = (secure ? https : http).request(
        url,
        {
          // A pooled socket would skip the lookup, and with it the check.
          agent: false,
          lookup: guardedLookup(allow, port),
          signal: AbortSignal.timeout(
            Math.min(options.timeoutMs ?? REQUEST_TIMEOUT_MS, remaining),
          ),
          headers: {
            "user-agent": USER_AGENT,
            accept: options.accept ?? "*/*",
            "accept-encoding": "gzip, br, deflate",
          },
        },
        resolve,
      );
      request.on("error", reject);
      request.end();
    },
  );

  const status = response.statusCode ?? 0;
  const location = response.headers.location;
  if (REDIRECTS.has(status) && location) {
    response.destroy();
    return new URL(location, url);
  }

  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;
  try {
    for await (const chunk of decoded(response) as AsyncIterable<Buffer>) {
      size += chunk.length;
      if (size > options.maxBytes) {
        chunks.push(chunk.subarray(0, chunk.length - (size - options.maxBytes)));
        truncated = true;
        break;
      }
      chunks.push(chunk);
    }
  } finally {
    response.destroy();
  }
  return {
    url: url.href,
    status,
    contentType: response.headers["content-type"] ?? "",
    body: Buffer.concat(chunks),
    truncated,
  };
}

function asFetchError(error: unknown) {
  if (error instanceof FetchError) return error;
  const name = error instanceof Error ? error.name : "";
  return new FetchError(
    name === "AbortError" || name === "TimeoutError" ? "timeout" : "unreachable",
  );
}

export function createFetcher(allow: Allow): Fetcher {
  return async (start, options) => {
    try {
      let url = new URL(start);
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const step = await requestOnce(url, options, allow);
        if (!(step instanceof URL)) return step;
        url = step;
      }
      throw new FetchError("unreachable");
    } catch (error) {
      throw asFetchError(error);
    }
  };
}

// For addresses that come from outside: public hosts on the web's own ports only.
export const safeFetch = createFetcher(
  (address, port) => (port === 80 || port === 443) && isPublicAddress(address),
);
