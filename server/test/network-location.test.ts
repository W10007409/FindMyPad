import { describe, it, expect } from 'vitest';
import { resolveNetworkLocation } from '../src/services/network-location.js';

describe('resolveNetworkLocation', () => {
  it('flags corp IP inside CIDR as onCorpNetwork', () => {
    const r = resolveNetworkLocation('10.20.30.40', { corpCidrs: ['10.20.0.0/16'] });
    expect(r.onCorpNetwork).toBe(true);
    expect(r.publicIp).toBe('10.20.30.40');
  });

  it('flags outside IP as not on corp', () => {
    expect(resolveNetworkLocation('8.8.8.8', { corpCidrs: ['10.20.0.0/16'] }).onCorpNetwork).toBe(false);
  });

  it('null ip → not corp, publicIp null', () => {
    expect(resolveNetworkLocation(null, { corpCidrs: [] })).toEqual({ publicIp: null, onCorpNetwork: false });
  });

  it('bare IP entry (no /suffix) is treated as /32 and matches exactly', () => {
    const r = resolveNetworkLocation('203.0.113.5', { corpCidrs: ['203.0.113.5'] });
    expect(r.onCorpNetwork).toBe(true);
    expect(resolveNetworkLocation('203.0.113.6', { corpCidrs: ['203.0.113.5'] }).onCorpNetwork).toBe(false);
  });

  it('malformed CIDR entries in the list are skipped without throwing', () => {
    expect(() =>
      resolveNetworkLocation('10.20.30.40', { corpCidrs: ['not-a-cidr', '', '10.20.0.0/16', '999.999.999.999/8'] }),
    ).not.toThrow();
    const r = resolveNetworkLocation('10.20.30.40', {
      corpCidrs: ['not-a-cidr', '', '10.20.0.0/16', '999.999.999.999/8'],
    });
    expect(r.onCorpNetwork).toBe(true);
  });

  it('boundary of a /16 block: last address inside matches, first address of next block does not', () => {
    expect(resolveNetworkLocation('10.20.255.255', { corpCidrs: ['10.20.0.0/16'] }).onCorpNetwork).toBe(true);
    expect(resolveNetworkLocation('10.21.0.0', { corpCidrs: ['10.20.0.0/16'] }).onCorpNetwork).toBe(false);
  });

  it('non-IPv4 (e.g. IPv6) input is never on corp network but publicIp is echoed back', () => {
    const r = resolveNetworkLocation('::1', { corpCidrs: ['10.20.0.0/16'] });
    expect(r.onCorpNetwork).toBe(false);
    expect(r.publicIp).toBe('::1');
  });

  it('mmdbPath pointing at a nonexistent file does not throw and leaves city/region undefined', () => {
    const r = resolveNetworkLocation('8.8.8.8', { corpCidrs: [], mmdbPath: 'F:/does/not/exist.mmdb' });
    expect(r.city).toBeUndefined();
    expect(r.region).toBeUndefined();
  });
});
