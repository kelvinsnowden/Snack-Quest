/**
 * The platform's official social pages (§ centralize social links) —
 * one place to update if a handle ever changes, same discipline as
 * `lib/config/whatsapp.ts`'s `WHATSAPP_CTA_NUMBER`. Every on-site
 * mention of Facebook/TikTok/Instagram reads from here rather than
 * hardcoding a URL.
 */
export const SOCIAL_LINKS = {
  facebook: 'https://www.facebook.com/snackquestke',
  tiktok: 'https://www.tiktok.com/@snackquests',
  instagram: 'https://www.instagram.com/snack_questke',
} as const;
