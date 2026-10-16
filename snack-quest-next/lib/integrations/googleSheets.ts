import 'server-only';

import { JWT } from 'google-auth-library';
import type { SheetRow } from '@/lib/leads/sheetRow';

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

/**
 * Reads a private Google Sheet as the app's own service account — the
 * same Firebase Admin credentials, so there is no extra key to manage.
 * The sheet only has to be shared (Viewer) with
 * `FIREBASE_ADMIN_CLIENT_EMAIL`, and the Google Sheets API enabled in
 * that service account's Google Cloud project.
 */
function serviceAccount(): JWT {
  const email = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const key = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL and FIREBASE_ADMIN_PRIVATE_KEY are needed to read Google Sheets.');
  }
  // Vercel env vars store literal "\n" sequences, not real newlines.
  return new JWT({ email, key: key.replace(/\\n/g, '\n'), scopes: [SCOPE] });
}

/** Turns a values grid into one object per row, keyed by the header row. Blank rows are dropped. */
export function gridToRows(values: string[][]): SheetRow[] {
  const [header, ...body] = values;
  if (!header) return [];
  const keys = header.map((cell) => String(cell ?? '').trim());
  const rows: SheetRow[] = [];
  for (const cells of body) {
    const row: SheetRow = {};
    let hasValue = false;
    keys.forEach((key, i) => {
      if (!key) return;
      const value = String(cells[i] ?? '');
      if (value !== '') hasValue = true;
      row[key] = value;
    });
    if (hasValue) rows.push(row);
  }
  return rows;
}

/**
 * Every row of one tab (the first tab when `tab` is blank), as shown in
 * the sheet — formatted values keep phone numbers' leading 0 or + intact.
 */
export async function readSheetRows(spreadsheetId: string, tab?: string): Promise<SheetRow[]> {
  // A bare A1 range reads the first tab; a tab name is quoted so spaces work.
  const range = tab ? `'${tab.replace(/'/g, "''")}'` : 'A:ZZ';
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(range)}?valueRenderOption=FORMATTED_VALUE`;
  const response = await serviceAccount().request<{ values?: string[][] }>({ url });
  return gridToRows(response.data.values ?? []);
}
