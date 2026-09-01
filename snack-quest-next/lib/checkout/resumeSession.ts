/**
 * Getting a customer back to a payment they walked away from
 * (§ checkout second pass).
 *
 * `/checkout/{sessionId}` is already the whole answer to a refresh or
 * a back button — it is one URL that renders whichever state is true
 * now. What it could not survive was the tab closing, because then
 * nobody held the URL any more. The customer had entered a PIN, or was
 * about to, and had no way back to find out whether it worked.
 *
 * The fix is to let their own browser remember it. No new record, no
 * link to email or text, nothing new to secure: the session id is
 * already in their address bar, and putting a copy in their own
 * `localStorage` gives it away to nobody it was not already shown to.
 *
 * Considered and rejected: texting a recovery link when the STK push
 * goes out. It costs money on every checkout, and it arrives in the
 * same second as the M-Pesa prompt — competing for attention at the
 * exact moment the customer needs to read that prompt. A resume banner
 * costs nothing and appears only for the person who came back.
 *
 * Cleared as soon as the payment reaches an end state, so a returning
 * customer is never offered a stale order to "finish".
 */

const KEY = 'sq_pending_checkout';

/** How long a pending payment is worth offering to resume. */
const RESUMABLE_FOR_MS = 2 * 60 * 60 * 1000;

export interface PendingCheckout {
  sessionId: string;
  /** What they were buying, so the banner can say so rather than showing a bare id. */
  label: string;
  totalKes: number;
  startedAtMs: number;
}

/**
 * Every read and write is wrapped.
 *
 * `localStorage` throws rather than returning null in a private window
 * and wherever site data is blocked, and an unguarded access in a
 * checkout would take the page down for the customers least likely to
 * be forgiving about it.
 */
export function rememberPendingCheckout(pending: Omit<PendingCheckout, 'startedAtMs'>): void {
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ ...pending, startedAtMs: Date.now() } satisfies PendingCheckout),
    );
  } catch {
    // A browser that will not store this simply does not get the
    // banner. It is a convenience, never a step in the flow.
  }
}

export function forgetPendingCheckout(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

/**
 * The payment worth returning to, or null.
 *
 * Anything older than a couple of hours is dropped rather than shown:
 * an M-Pesa prompt expires in about a minute, so a day-old entry is
 * not an unfinished payment, it is a customer who changed their mind,
 * and inviting them to "finish" it would be misleading.
 */
export function readPendingCheckout(): PendingCheckout | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<PendingCheckout>;
    if (typeof parsed.sessionId !== 'string' || typeof parsed.startedAtMs !== 'number') {
      return null;
    }
    if (Date.now() - parsed.startedAtMs > RESUMABLE_FOR_MS) {
      forgetPendingCheckout();
      return null;
    }
    return {
      sessionId: parsed.sessionId,
      label: typeof parsed.label === 'string' ? parsed.label : 'your order',
      totalKes: typeof parsed.totalKes === 'number' ? parsed.totalKes : 0,
      startedAtMs: parsed.startedAtMs,
    };
  } catch {
    return null;
  }
}
