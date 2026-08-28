import { describe, expect, it } from 'vitest';
import { isFbc, rawFbclid, resolveFbc, toFbc } from '@/lib/analytics/metaClickId';

/**
 * Meta's `fbc` (§ close the loop: ad-conversion attribution).
 *
 * A real click id from production, kept verbatim: these values carry
 * `_`, `-` and `A`-`z`, and the point of using a real one is to prove
 * the parsing does not quietly mangle a character class a made-up id
 * would never contain.
 */
const REAL_FBCLID =
  'PAdGRleAT7mx9wZG9mAmZkaWQWUNPn7uK6nlxyEJw-qgs25kt5mRletGV4dG4DYWVtAjExAHNydGMGYXBwX2lkDzEyNDAyNDU3NDI4NzQxNAABpwl0-cX7XReCa9nyQV5HL8lw70e5xZK55VivLaBlHVUx9DSX7ckXj_2vHMTg_aem_aKtICYk7gGrpdk7cBq6Q4w';

describe('toFbc', () => {
  it('builds the four-part value Meta matches on', () => {
    expect(toFbc('abc123', 1_724_760_000_000)).toBe('fb.1.1724760000000.abc123');
  });

  /*
   * The timestamp is the click, not the purchase. Someone who clicks an
   * ad on Monday and pays on Thursday has to be reported with Monday's
   * time or they fall outside the attribution window the value exists
   * to prove they are inside.
   */
  it('carries the observation time it was given, not the current time', () => {
    const clickedAt = Date.now() - 3 * 24 * 60 * 60 * 1000;
    expect(toFbc('abc123', clickedAt).split('.')[2]).toBe(String(clickedAt));
  });

  it('keeps a real click id byte for byte', () => {
    expect(toFbc(REAL_FBCLID, 1_724_760_000_000).endsWith(`.${REAL_FBCLID}`)).toBe(true);
  });
});

describe('isFbc', () => {
  it('recognises a formatted value', () => {
    expect(isFbc(toFbc(REAL_FBCLID, Date.now()))).toBe(true);
  });

  /* Every cookie and every attribution snapshot written before this existed. */
  it('rejects a bare click id', () => {
    expect(isFbc(REAL_FBCLID)).toBe(false);
    expect(isFbc('abc123')).toBe(false);
  });

  /** A click id that merely starts "fb." is not a formatted one; without the timestamp check it would be taken as one and sent malformed. */
  it('rejects an fb-prefixed value with no timestamp', () => {
    expect(isFbc('fb.1.notatime.abc')).toBe(false);
  });
});

describe('resolveFbc', () => {
  it('passes a stored fbc through untouched, keeping the real click time', () => {
    const stored = toFbc(REAL_FBCLID, 1_724_760_000_000);
    expect(resolveFbc(stored, Date.now())).toBe(stored);
  });

  /*
   * Old rows hold a bare id with no record of when the click happened.
   * Sending an approximate time is Meta's own guidance for that case,
   * and strictly better than sending nothing and letting the conversion
   * match on a phone hash alone.
   */
  it('derives one for a legacy bare click id, using the fallback time', () => {
    expect(resolveFbc('abc123', 1_724_760_000_000)).toBe('fb.1.1724760000000.abc123');
  });

  it('is idempotent, so a value cannot be double-wrapped', () => {
    const once = resolveFbc('abc123', 1_724_760_000_000);
    expect(resolveFbc(once, Date.now())).toBe(once);
  });
});

describe('rawFbclid', () => {
  it('recovers the click id from a formatted value', () => {
    expect(rawFbclid(toFbc(REAL_FBCLID, Date.now()))).toBe(REAL_FBCLID);
  });

  it('leaves a bare click id alone', () => {
    expect(rawFbclid(REAL_FBCLID)).toBe(REAL_FBCLID);
  });

  /** Only the first three separators are structural, so a click id containing a dot survives the round trip. */
  it('does not truncate a click id containing a dot', () => {
    expect(rawFbclid(toFbc('has.dots.inside', 1_724_760_000_000))).toBe('has.dots.inside');
  });
});
