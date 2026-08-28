/**
 * Meta's click id, in the form Meta actually matches on (§ close the
 * loop: ad-conversion attribution).
 *
 * `?fbclid=` has been captured first-touch into a cookie for a while,
 * and then gone nowhere: the Conversions API payload carried a hashed
 * phone number and nothing else, so a purchase that came from a Meta
 * ad reached Meta as "somebody with this phone hash paid", to be
 * matched against profile data or not matched at all. The click id was
 * sitting in Firestore the whole time.
 *
 * Meta does not want the raw id. It wants `fbc`:
 *
 *     fb.<subdomain index>.<click time in ms>.<fbclid>
 *
 * The subdomain index is 1 for a click landing on `www.snackquests.shop`
 * (0 would be a bare apex domain, 2 a third-level subdomain). The
 * timestamp is when the click was *observed*, not when the order was
 * placed, which is why capture has to record it: someone who clicks an
 * ad on Monday and pays on Thursday would otherwise be reported with a
 * Thursday click time and fall outside the very attribution window the
 * value exists to prove they are inside.
 */

/**
 * Meta's own browser cookie, set by the Pixel on this domain.
 *
 * First-party, and not `httpOnly` since the Pixel's JavaScript writes
 * it, so it arrives on our own server requests and can simply be read.
 * Never set here: it belongs to the Pixel, and a value invented by this
 * app would be a browser id matching no browser Meta knows.
 */
export const META_BROWSER_ID_COOKIE = '_fbp';

/** `www.snackquests.shop` is one level below the registrable domain. */
const SUBDOMAIN_INDEX = 1;

const FBC_PREFIX = `fb.${SUBDOMAIN_INDEX}.`;

/** Whether a stored value is already a formatted `fbc` rather than a bare click id. */
export function isFbc(value: string): boolean {
  if (!value.startsWith('fb.')) {
    return false;
  }
  const [, , timestamp] = value.split('.', 3);
  return Boolean(timestamp) && Number.isFinite(Number(timestamp));
}

/** Build `fbc` from a raw `fbclid` and the moment it was seen. */
export function toFbc(fbclid: string, observedAtMs: number): string {
  return `${FBC_PREFIX}${Math.floor(observedAtMs)}.${fbclid}`;
}

/**
 * The `fbc` to report, from whatever happens to be stored.
 *
 * Cookies set before capture recorded a timestamp hold a bare click
 * id, as do every attribution snapshot written until now. Those are
 * still worth sending: Meta's guidance for a click whose time was not
 * recorded is to use the time it was observed, and the closest thing
 * available for an old row is when it is being read. That is an
 * approximation and it is only ever applied to values that predate the
 * timestamp being stored at all, which is why `toFbc` is used directly
 * at capture, where the real time is known.
 */
export function resolveFbc(stored: string, fallbackObservedAtMs: number): string {
  return isFbc(stored) ? stored : toFbc(stored, fallbackObservedAtMs);
}

/** The raw click id back out of a stored value, for display and for anything that predates `fbc`. */
export function rawFbclid(stored: string): string {
  if (!isFbc(stored)) {
    return stored;
  }
  // Only the first three separators are structural; the click id itself
  // is whatever remains, untouched.
  const parts = stored.split('.');
  return parts.slice(3).join('.');
}
