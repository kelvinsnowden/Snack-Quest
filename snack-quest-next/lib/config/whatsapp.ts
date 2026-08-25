/**
 * The one WhatsApp number every customer-facing CTA on the platform
 * points to (§ centralize WhatsApp CTA number). Previously each page
 * read `business.whatsappCustomerNumber` from Firestore — a nullable,
 * per-tenant field that had to be threaded through every component and
 * left the site with a "WhatsApp line isn't set up yet" fallback state
 * whenever it was unset. Changing the number now means editing this
 * one constant, not a Firestore field plus every place that read it.
 */
/*
 * International format, no `+` and no leading zero: `wa.me` rejects
 * both, and `app/(marketing)/layout.tsx` adds the `+` itself for the
 * structured-data `telephone`. 0759209705 is therefore 254759209705.
 */
export const WHATSAPP_CTA_NUMBER = '254759209705';
