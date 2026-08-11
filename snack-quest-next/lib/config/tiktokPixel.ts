/**
 * TikTok Pixel code for browser-side ad-conversion tracking on the
 * public marketing site (§ close the loop: ad-conversion attribution).
 * Distinct from the server-side Events API pixel code in
 * `businessIntegrationSecretRepository` (`lib/integrations/tiktok/config.ts`)
 * — that one is a per-business Firestore secret alongside an access
 * token that must stay server-only. A Pixel code has no such secrecy:
 * it's embedded in public client-side JS by design, same reasoning as
 * `META_PIXEL_ID`. Use this same value as the `pixelCode` field when
 * configuring the TikTok integration in Admin — matching pixels is
 * what lets TikTok de-duplicate the browser and server events for the
 * same visit.
 */
export const TIKTOK_PIXEL_CODE = 'D9TGEUBC77UDKVSV0UC0';
