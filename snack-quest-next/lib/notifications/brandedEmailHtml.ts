/**
 * The one branded email shell every outbound Snack Quest email uses —
 * table-based layout, inline CSS only, no web fonts/tracking pixels (§
 * Creator lifecycle emails, § Admin: Marketing Emails). Exactly two
 * image requests ever load: the fixed logo in the header band (below)
 * and the one optional hero image a sender explicitly attaches —
 * everything else (the gradient header, feature pills, testimonial
 * cards, the CTA button) is pure color and typography, so the email
 * stays a few KB and a low text-to-markup ratio regardless of how rich
 * it looks, which is what actually keeps spam filters happy —
 * "lightweight" was never a synonym for "plain."
 *
 * Every color-heavy property (`background: linear-gradient(...)`,
 * `border-radius`, `box-shadow`) is decorative and has a safe
 * fallback: a `background-color` declared alongside every gradient so
 * Outlook desktop's non-CSS3 rendering engine still gets a solid
 * brand color instead of a transparent band, and every rounded/
 * shadowed element degrades to a plain rectangle rather than breaking
 * layout.
 *
 * `scripts/seedNotificationTemplates.mjs` has its own smaller copy of
 * an earlier, simpler version of this shell (plain JS, since that
 * script runs standalone with no build step and can't import from
 * `lib/`) for the four static, pre-seeded transactional templates —
 * those stay intentionally minimal (a receipt-like notice, not a
 * marketing send). This richer version is for `MarketingEmailService`
 * — the same brand, a bigger occasion.
 */

const BRAND_ORANGE = '#ff7a00';
const BRAND_ORANGE_STRONG = '#e56a00';
const BRAND_PURPLE = '#6c3bff';
const INK = '#1f1105';
const BODY_TEXT = '#3a3a3a';
const MUTED = '#8a8a8a';
const PAGE_BG = '#f4f2fb';
const CARD_BG = '#faf9fd';
const FONT_STACK = "Arial,Helvetica,'Segoe UI',sans-serif";

/**
 * The real logo, absolute URL (email clients can't resolve a relative
 * path). Hardcoded rather than imported from `lib/seo/siteUrl.ts` —
 * this file is deliberately dependency-free and isomorphic (no
 * `'server-only'`, used client-side by `MarketingEmailPreview` too),
 * and `getSiteUrl()`'s Vercel-hostname fallback is documented as
 * Server-Component-only. Same file `public/logo.png` already serves
 * on every real page (`MarketingHeader`, `AdminSidebar`, etc.) — this
 * is that value, not a second logo.
 */
const LOGO_URL = 'https://www.snackquests.shop/logo.png';

/** Interpolating staff-authored (or customer-authored review) text into a hand-built HTML string always goes through this — never raw. */
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
    .map((paragraph) => `<p style="margin:0 0 14px;">${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('');
}

/** A real, published review — never fabricated. See `ReviewService.listPublished`, the only source this is ever built from. */
export interface EmailTestimonial {
  customerName: string;
  rating: number;
  body: string;
}

const MAX_TESTIMONIAL_BODY_LENGTH = 160;

function starRating(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

export interface BrandedEmailInput {
  heading: string;
  /** Already-safe HTML (e.g. from `paragraphsToHtml`) — never interpolate unescaped user text here directly. */
  bodyHtml: string;
  /** A hero image shown below the header band, above the heading. */
  imageUrl?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Up to 3 short highlights (the sender types the whole pill text, emoji included) shown as a row of pills below the message. */
  featurePills?: string[];
  /** Real, published reviews to feature as social proof — omit or pass `[]` for none. */
  testimonials?: EmailTestimonial[];
  /** Footer line — defaults to the standard creator-program footer. */
  footerText?: string;
}

function renderFeaturePills(pills: string[]): string {
  const trimmed = pills.map((p) => p.trim()).filter(Boolean).slice(0, 3);
  if (trimmed.length === 0) {
    return '';
  }
  const cellWidth = Math.floor(100 / trimmed.length);
  const cells = trimmed
    .map(
      (pill) =>
        `<td align="center" width="${cellWidth}%" style="padding:4px;">` +
        `<div style="background:${CARD_BG};border:1px solid #ece7f7;border-radius:12px;padding:10px 8px;font-size:12px;font-weight:700;color:${INK};line-height:1.35;word-break:break-word;">${escapeHtml(pill)}</div>` +
        '</td>',
    )
    .join('');
  // `table-layout:fixed` is load-bearing here, not decoration: without
  // it, auto table layout lets a long pill's un-wrapped content grow
  // its column past the explicit width — and since a table has no
  // `overflow` to clip against, that silently widens this whole row
  // (and the fixed-560px card around it) rather than wrapping text.
  return (
    `<tr><td style="padding:4px 32px 8px;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>${cells}</tr></table>` +
    '</td></tr>'
  );
}

function renderTestimonials(testimonials: EmailTestimonial[]): string {
  const real = testimonials.slice(0, 2);
  if (real.length === 0) {
    return '';
  }
  const cards = real
    .map(
      (t) =>
        `<div style="background:${CARD_BG};border-radius:12px;padding:16px 18px;margin-bottom:10px;">` +
        `<div style="color:${BRAND_ORANGE};font-size:14px;letter-spacing:1px;margin-bottom:6px;">${starRating(t.rating)}</div>` +
        `<p style="margin:0 0 8px;font-size:14px;line-height:1.55;color:${BODY_TEXT};font-style:italic;">“${escapeHtml(truncate(t.body, MAX_TESTIMONIAL_BODY_LENGTH))}”</p>` +
        `<p style="margin:0;font-size:12px;font-weight:700;color:${INK};">— ${escapeHtml(t.customerName)}</p>` +
        '</div>',
    )
    .join('');
  return (
    `<tr><td style="padding:8px 32px 8px;">` +
    `<p style="margin:0 0 12px;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${BRAND_PURPLE};">What people are saying</p>` +
    cards +
    '</td></tr>'
  );
}

export function brandedEmailHtml({
  heading,
  bodyHtml,
  imageUrl,
  ctaLabel,
  ctaUrl,
  featurePills = [],
  testimonials = [],
  footerText = 'Snack Quest · This is an automated message.',
}: BrandedEmailInput): string {
  const image = imageUrl
    ? `<tr><td style="padding:0;line-height:0;"><img src="${escapeHtml(imageUrl)}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto;" /></td></tr>`
    : '';
  const cta =
    ctaLabel && ctaUrl
      ? `<tr><td style="padding:12px 32px 8px;text-align:center;">` +
        `<a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background-color:${BRAND_ORANGE};background:linear-gradient(135deg,${BRAND_ORANGE},${BRAND_ORANGE_STRONG});color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:14px 36px;border-radius:999px;font-family:${FONT_STACK};">${escapeHtml(ctaLabel)}</a>` +
        '</td></tr>'
      : '';

  return (
    `<!doctype html><html><body style="margin:0;padding:0;background-color:${PAGE_BG};font-family:${FONT_STACK};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${PAGE_BG};padding:24px 0;">` +
    '<tr><td align="center">' +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;">` +
    // Header band — gradient with a solid fallback (see file doc comment).
    // The `alt` text is the fallback for the (common) case a client
    // blocks images until the recipient opts in — the colored band
    // still reads as branded even with the logo unloaded.
    `<tr><td style="background-color:${BRAND_ORANGE};background:linear-gradient(135deg,${BRAND_ORANGE} 0%,${BRAND_PURPLE} 100%);padding:20px 32px;text-align:center;">` +
    `<img src="${LOGO_URL}" width="64" height="64" alt="Snack Quest" style="display:block;margin:0 auto;width:64px;height:64px;border-radius:14px;border:0;" />` +
    '</td></tr>' +
    image +
    `<tr><td style="padding:32px 32px 4px;text-align:center;">` +
    `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.28;color:${INK};font-weight:800;font-family:${FONT_STACK};">${escapeHtml(heading)}</h1>` +
    `<div style="font-size:15px;line-height:1.65;color:${BODY_TEXT};text-align:left;">${bodyHtml}</div>` +
    '</td></tr>' +
    renderFeaturePills(featurePills) +
    cta +
    renderTestimonials(testimonials) +
    `<tr><td style="padding:24px 32px 26px;border-top:1px solid #eee6ff;margin-top:8px;text-align:center;">` +
    `<p style="margin:0;font-size:12px;color:${MUTED};">${escapeHtml(footerText)}</p>` +
    '</td></tr>' +
    '</table></td></tr></table></body></html>'
  );
}
