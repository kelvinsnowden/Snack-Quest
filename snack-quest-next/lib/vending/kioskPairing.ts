/**
 * QR pairing for a machine's screen. The admin shows a code for
 * `/machine/<code>#pair=<key>`; the screen opens it, keeps the key and
 * wipes the fragment. The key rides after `#` because browsers never
 * send the fragment to a server, so it can't land in a request log or a
 * referrer.
 */
export function pairingLink(origin: string, machineCode: string, secret: string): string {
  return `${origin}/machine/${encodeURIComponent(machineCode)}#pair=${encodeURIComponent(secret)}`;
}

/** The key from a pairing link's `#pair=<key>` fragment, if there is one. Keys are hex; anything else is ignored. */
export function readPairingFragment(hash: string): string | null {
  const match = /^#pair=([0-9a-f]{16,256})$/i.exec(hash);
  return match ? match[1] : null;
}
