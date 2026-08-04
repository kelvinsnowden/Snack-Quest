/**
 * Meta Pixel ID for browser-side ad-conversion tracking on the public
 * marketing site (§ add Meta Pixel). Distinct from the server-side
 * Conversions API pixel ID in `businessIntegrationSecretRepository`
 * (`lib/integrations/meta/config.ts`) — that one is a per-business
 * Firestore secret alongside an access token that must stay server-only.
 * A Pixel ID has no such secrecy: it's embedded in public client-side
 * JS by design, so a plain constant here is correct, not a shortcut.
 */
export const META_PIXEL_ID = '1337718258041876';
