/**
 * Shared presentation logic for a campaign's creative asset and
 * deadline — used by both the full Campaigns grid and the dashboard's
 * campaign carousel/featured banner so the two surfaces never drift
 * on what counts as "closing soon" or a video asset.
 */

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

export function isVideoAsset(url: string): boolean {
  const path = url.split('?')[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => path.endsWith(ext));
}

/** Days until a Firestore deadline Timestamp resolves, or `null` if unset. Only used to flag campaigns actually closing soon — a deadline months out isn't "urgent". */
export function daysUntilDeadline(value: unknown): number | null {
  const timestamp = value as { toDate?: () => Date } | undefined;
  const date = timestamp?.toDate ? timestamp.toDate() : null;
  if (!date) return null;
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.ceil((date.getTime() - Date.now()) / msPerDay);
}

/** Whether a campaign's deadline Timestamp has already passed — the same check `CampaignService.submitDeliverable` gates joining on, kept here so a Server Component never calls `Date.now()` directly in its own render body. */
export function isDeadlinePassed(value: unknown): boolean {
  const timestamp = value as { toMillis?: () => number } | undefined;
  const millis = timestamp?.toMillis ? timestamp.toMillis() : null;
  return millis !== null && millis < Date.now();
}

export function urgencyLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'Ends today';
  if (daysLeft === 1) return '1 day left';
  return `${daysLeft} days left`;
}

/** A campaign is worth calling out on the dashboard once it has a real deadline within this window. */
export const CLOSING_SOON_WINDOW_DAYS = 7;
