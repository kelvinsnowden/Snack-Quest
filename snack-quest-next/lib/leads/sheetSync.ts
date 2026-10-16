/**
 * Plain-language reasons the Google Sheet could not be read, for the
 * staff who have to fix them. Google's own messages name the cause but
 * not the fix.
 */
export function sheetSyncErrorMessage(error: unknown): string {
  const status = (error as { status?: number; response?: { status?: number } })?.response?.status ??
    (error as { status?: number })?.status;
  const raw = error instanceof Error ? error.message : String(error);
  const email = process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? 'the service account';
  if (status === 403 && /has not been used|is disabled|SERVICE_DISABLED/i.test(raw)) {
    return 'The Google Sheets API is turned off for this Google Cloud project. Enable it, wait a minute, then sync again.';
  }
  if (status === 403) {
    return `The sheet isn't shared with the site. Share it (Viewer) with ${email}.`;
  }
  if (status === 404) {
    return 'No sheet with that ID. Check LEADS_SHEET_ID in Vercel is the long ID from the sheet’s link.';
  }
  if (status === 400 && /Unable to parse range/i.test(raw)) {
    return 'No tab with the name in LEADS_SHEET_TAB. Leave it blank to read the first tab.';
  }
  return `Couldn't read the Google Sheet: ${raw.slice(0, 200)}`;
}
