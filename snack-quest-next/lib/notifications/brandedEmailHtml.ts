/**
 * The one branded email shell every outbound Snack Quest email uses —
 * table-based layout, inline CSS only, no external images/web
 * fonts/tracking pixels (§ Creator lifecycle emails). Keeping the
 * markup this small keeps a low text-to-markup ratio and a tiny
 * payload, both of which spam filters score favorably compared to an
 * image-heavy HTML email.
 *
 * `scripts/seedNotificationTemplates.mjs` has its own copy of this
 * same visual shell (plain JS, since that script runs standalone with
 * no build step and can't import from `lib/`) for the four static,
 * pre-seeded transactional templates. This is the reusable runtime
 * version, for anything composed dynamically — today, only
 * `services/marketingEmailService.ts`.
 */

const BRAND_ORANGE = '#ff7a00';
const INK = '#1f1105';
const BODY_TEXT = '#3a3a3a';
const MUTED = '#8a8a8a';
const PAGE_BG = '#f4f1ec';

/** Interpolating staff-authored text into a hand-built HTML string always goes through this — never raw. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Blank-line-separated paragraphs of plain text into escaped `<p>` tags — the same shape every seeded transactional template's body already has. */
export function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

export interface BrandedEmailInput {
  heading: string;
  /** Already-safe HTML (e.g. from `paragraphsToHtml`) — never interpolate unescaped user text here directly. */
  bodyHtml: string;
  /** A hero image shown below the header bar, above the heading. */
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Footer line — defaults to the standard creator-program footer. */
  footerText?: string;
}

export function brandedEmailHtml({
  heading,
  bodyHtml,
  imageUrl,
  ctaLabel,
  ctaUrl,
  footerText = 'Snack Quest · This is an automated message.',
}: BrandedEmailInput): string {
  const image = imageUrl
    ? `<tr><td style="padding:0;"><img src="${escapeHtml(imageUrl)}" alt="" width="480" style="display:block;width:100%;max-width:480px;height:auto;" /></td></tr>`
    : '';
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:4px 32px 4px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${BRAND_ORANGE};color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(ctaLabel)}</a></td></tr>`
      : '';

  return (
    `<!doctype html><html><body style="margin:0;padding:0;background:${PAGE_BG};font-family:Arial,Helvetica,sans-serif;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE_BG};padding:24px 0;">` +
    '<tr><td align="center">' +
    `<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;">` +
    `<tr><td style="background:${BRAND_ORANGE};padding:20px 32px;"><span style="color:#ffffff;font-size:18px;font-weight:700;">Snack Quest</span></td></tr>` +
    image +
    `<tr><td style="padding:28px 32px 8px;"><h1 style="margin:0 0 12px;font-size:20px;color:${INK};">${escapeHtml(heading)}</h1>` +
    `<div style="font-size:15px;line-height:1.6;color:${BODY_TEXT};">${bodyHtml}</div></td></tr>` +
    cta +
    `<tr><td style="padding:20px 32px 28px;"><p style="margin:0;font-size:12px;color:${MUTED};">${escapeHtml(footerText)}</p></td></tr>` +
    '</table></td></tr></table></body></html>'
  );
}
