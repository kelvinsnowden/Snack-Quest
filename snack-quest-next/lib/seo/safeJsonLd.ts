/**
 * § Security audit — every `<script type="application/ld+json">` block
 * in this codebase embeds its data via
 * `dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}`. Plain
 * `JSON.stringify` does not escape `<`, so a `</script>` inside any
 * string field breaks out of the script tag and injects real markup
 * into the page — reaching every visitor, not just whoever entered
 * the text. The fields involved (a package name/description, an FAQ
 * question/answer) are admin-authored today, but that's an argument
 * for defense in depth, not a reason to skip it: an admin-credential
 * compromise or a future less-trusted content source would otherwise
 * turn straight into stored XSS against the whole storefront.
 *
 * The escape sequence `<` parses back to `<` identically to a
 * literal `<`, so this changes nothing about the structured data
 * itself — it only removes the one byte sequence (`</script>`)
 * capable of ending the tag early.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
