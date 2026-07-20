import { existsSync } from 'node:fs';

export type NetworkLocation = {
  publicIp: string | null;
  onCorpNetwork: boolean;
  city?: string | null;
  region?: string | null;
};

/** Parses a dotted-quad IPv4 string into an unsigned 32-bit integer, or null if invalid. */
function ipv4ToUint32(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    value = (value << 8) | octet;
  }
  return value >>> 0;
}

/** Builds a network mask for a CIDR prefix length (0-32) as an unsigned 32-bit integer. */
function cidrMask(bits: number): number {
  if (bits <= 0) return 0;
  if (bits >= 32) return 0xffffffff >>> 0;
  return (0xffffffff << (32 - bits)) >>> 0;
}

type ParsedCidr = { network: number; mask: number };

/** Parses a bare IP (treated as /32) or `a.b.c.d/n` entry. Returns null for anything malformed. */
function parseCidrEntry(entry: string): ParsedCidr | null {
  const trimmed = entry.trim();
  if (!trimmed) return null;
  const slashIndex = trimmed.indexOf('/');
  const ipPart = slashIndex === -1 ? trimmed : trimmed.slice(0, slashIndex);
  const bitsPart = slashIndex === -1 ? '32' : trimmed.slice(slashIndex + 1);
  const bits = Number(bitsPart);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null;
  const ipInt = ipv4ToUint32(ipPart);
  if (ipInt === null) return null;
  const mask = cidrMask(bits);
  return { network: (ipInt & mask) >>> 0, mask };
}

function matchesCidr(ipInt: number, entry: string): boolean {
  const parsed = parseCidrEntry(entry);
  if (!parsed) return false;
  return ((ipInt & parsed.mask) >>> 0) === parsed.network;
}

/**
 * Best-effort offline geo lookup via an optional MaxMind mmdb file. `maxmind` is intentionally
 * NOT a project dependency — this lazily imports it only when a usable mmdbPath is configured,
 * and swallows any failure (module absent, file unreadable, no match). Because
 * resolveNetworkLocation() must stay synchronous (later tasks depend on that signature), this
 * lookup cannot populate the result it's attached to; it's a defensive no-op placeholder until a
 * proper async geo path is introduced.
 */
function tryGeoLookup(mmdbPath: string): void {
  try {
    if (!existsSync(mmdbPath)) return;
    const moduleName = 'maxmind';
    void import(moduleName).catch(() => {
      // maxmind not installed, or failed to load — no-op by design.
    });
  } catch {
    // defensive: never let geo lookup affect corp/external classification.
  }
}

/**
 * Classifies a report's public IP as on-corp-network vs external using a configurable list of
 * CIDR blocks / bare IPs (IPv4 only). Pure w.r.t. corp/external classification; geo enrichment
 * (city/region) is best-effort and optional, see tryGeoLookup().
 */
export function resolveNetworkLocation(
  ip: string | null,
  opts: { corpCidrs: string[]; mmdbPath?: string },
): NetworkLocation {
  if (opts.mmdbPath) {
    tryGeoLookup(opts.mmdbPath);
  }

  if (!ip) {
    return { publicIp: null, onCorpNetwork: false };
  }

  const ipInt = ipv4ToUint32(ip);
  const onCorpNetwork = ipInt === null ? false : opts.corpCidrs.some((cidr) => matchesCidr(ipInt, cidr));
  return { publicIp: ip, onCorpNetwork };
}
