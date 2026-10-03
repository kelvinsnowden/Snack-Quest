import { describe, expect, it } from 'vitest';
import { pairingLink, readPairingFragment } from '@/lib/vending/kioskPairing';

/** QR pairing: the key travels only in the URL fragment, and the screen only accepts a key-shaped value from it. */
describe('kiosk pairing links', () => {
  const key = 'ab12'.repeat(16);

  it('puts the key after # so it is never sent to a server', () => {
    const link = pairingLink('https://snackquest.example', 'SQ-MCH-000001', key);
    expect(link).toBe(`https://snackquest.example/machine/SQ-MCH-000001#pair=${key}`);
    const url = new URL(link);
    expect(url.search).toBe('');
    expect(url.pathname).not.toContain(key);
    expect(url.hash).toBe(`#pair=${key}`);
  });

  it('reads back exactly the key, and ignores anything that is not one', () => {
    expect(readPairingFragment(new URL(pairingLink('https://x.example', 'SQ 1', key)).hash)).toBe(key);
    expect(readPairingFragment('')).toBeNull();
    expect(readPairingFragment('#pair=')).toBeNull();
    expect(readPairingFragment('#pair=short')).toBeNull();
    expect(readPairingFragment(`#pair=${key}&next=https://evil.example`)).toBeNull();
    expect(readPairingFragment(`#other=${key}`)).toBeNull();
    expect(readPairingFragment('#pair=<script>alert(1)</script>')).toBeNull();
  });
});
