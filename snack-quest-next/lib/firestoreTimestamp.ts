/** Converts any Firestore Timestamp-shaped value (Admin or client SDK) to epoch millis — 0 for a still-pending server-timestamp sentinel or a missing value, never a thrown error. */
export function toMillis(value: unknown): number {
  const timestamp = value as { toMillis?: () => number } | undefined;
  return timestamp?.toMillis ? timestamp.toMillis() : 0;
}
