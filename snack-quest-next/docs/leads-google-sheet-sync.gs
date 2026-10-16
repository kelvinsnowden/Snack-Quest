/**
 * Snack Quest — send vending leads from this Google Sheet to the admin
 * (Admin → Vending → Leads).
 *
 * SETUP (once, about 3 minutes)
 * 1. In Vercel → snack-quest project → Settings → Environment Variables,
 *    add LEADS_SHEET_SECRET with a long random value (e.g. 40+ random
 *    letters and numbers), then redeploy.
 * 2. In this Google Sheet: Extensions → Apps Script. Delete what is there,
 *    paste this whole file, and set SECRET below to the same value.
 * 3. Save, then choose the function `installTrigger` in the toolbar and
 *    press Run. Google asks for permission the first time — allow it.
 *    That's it: new leads arrive in the admin within 5 minutes.
 *
 * The sheet stays private. Row 1 must be the column headers (Meta's own
 * integration already does this). Rows are matched by Meta's lead id,
 * so nothing is ever duplicated — running "Send ALL rows again" is safe.
 */

// www: the bare domain 308-redirects there, and Apps Script re-sends a
// redirected POST as a GET, which this route answers with 405.
const ENDPOINT = 'https://www.snackquests.shop/api/leads/sheet';
const SECRET = 'PASTE-THE-SAME-VALUE-AS-LEADS_SHEET_SECRET';
/** Leave blank to use the first tab, or put the tab name Meta writes to. */
const SHEET_NAME = '';

const BATCH_SIZE = 200;
const SENT_KEY_PREFIX = 'sent_';
const SENT_CHUNK_CHARS = 8000;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Snack Quest')
    .addItem('Send new leads to admin now', 'syncLeads')
    .addItem('Send ALL rows again', 'resyncAll')
    .addToUi();
}

/** Run once. Sends new rows every 5 minutes from now on. */
function installTrigger() {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'syncLeads')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('syncLeads').timeBased().everyMinutes(5).create();
  syncLeads();
}

function resyncAll() {
  saveSent_([]);
  syncLeads();
}

function syncLeads() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    const sheet = SHEET_NAME
      ? SpreadsheetApp.getActive().getSheetByName(SHEET_NAME)
      : SpreadsheetApp.getActive().getSheets()[0];
    if (!sheet) {
      console.error('No tab named "' + SHEET_NAME + '". Tabs in this sheet: ' +
        SpreadsheetApp.getActive().getSheets().map((s) => '"' + s.getName() + '"').join(', '));
      return;
    }
    if (sheet.getLastRow() < 2) {
      console.log('Tab "' + sheet.getName() + '" has no lead rows under the header yet.');
      return;
    }

    const range = sheet.getDataRange();
    const values = range.getValues();
    const display = range.getDisplayValues();
    const headers = display[0].map((h) => String(h).trim());

    const sent = new Set(loadSent_());
    const pending = [];
    for (let r = 1; r < values.length; r++) {
      const row = {};
      let hasValue = false;
      for (let c = 0; c < headers.length; c++) {
        if (!headers[c]) continue;
        const raw = values[r][c];
        // Dates as ISO so the server reads them exactly; everything else as
        // shown, which keeps phone numbers' leading 0 / + intact.
        const value = raw instanceof Date ? raw.toISOString() : display[r][c];
        if (value !== '') hasValue = true;
        row[headers[c]] = value;
      }
      if (!hasValue) continue;
      const key = fingerprint_(row);
      if (sent.has(key)) continue;
      pending.push({ key: key, row: row });
    }

    console.log('Tab "' + sheet.getName() + '": ' + (values.length - 1) + ' rows, ' + pending.length + ' not sent yet.');
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      const response = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + SECRET },
        payload: JSON.stringify({ rows: batch.map((item) => item.row) }),
        muteHttpExceptions: true,
      });
      const code = response.getResponseCode();
      if (code !== 200) {
        console.error('Lead sync failed (' + code + '): ' + response.getContentText().slice(0, 300));
        break; // Try again on the next run; nothing is marked as sent.
      }
      console.log('Sent ' + batch.length + ' rows: ' + response.getContentText().slice(0, 300));
      batch.forEach((item) => sent.add(item.key));
      saveSent_(Array.from(sent));
    }
  } finally {
    lock.releaseLock();
  }
}

/** Meta's lead id when the row has one, otherwise a hash of the whole row. */
function fingerprint_(row) {
  const id = row.id || row.ID || row.lead_id || row['Lead ID'];
  if (id) return String(id).replace(/^l:/, '');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(row));
  return 'h' + Utilities.base64EncodeWebSafe(bytes).slice(0, 16);
}

function loadSent_() {
  const props = PropertiesService.getScriptProperties().getProperties();
  return Object.keys(props)
    .filter((k) => k.indexOf(SENT_KEY_PREFIX) === 0)
    .sort()
    .map((k) => props[k])
    .join(',')
    .split(',')
    .filter(Boolean);
}

function saveSent_(keys) {
  const store = PropertiesService.getScriptProperties();
  Object.keys(store.getProperties())
    .filter((k) => k.indexOf(SENT_KEY_PREFIX) === 0)
    .forEach((k) => store.deleteProperty(k));
  const chunks = [];
  let current = '';
  keys.forEach((key) => {
    if (current.length + key.length + 1 > SENT_CHUNK_CHARS) {
      chunks.push(current);
      current = '';
    }
    current += (current ? ',' : '') + key;
  });
  if (current) chunks.push(current);
  const next = {};
  chunks.forEach((chunk, i) => (next[SENT_KEY_PREFIX + ('000' + i).slice(-4)] = chunk));
  // Apps Script fails with a bare "unknown error" when handed an empty object.
  if (chunks.length > 0) store.setProperties(next);
}
