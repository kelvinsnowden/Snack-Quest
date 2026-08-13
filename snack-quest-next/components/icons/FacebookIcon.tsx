/**
 * Extracted from `SocialLinks.tsx` (§ Creator Program CRO pass) so the
 * Creator Program's "what can I post" section can reuse the same real
 * brand mark instead of a second hand-drawn copy. lucide-react ships
 * no brand logos (licensing), hence the inline SVG — same 24x24
 * viewBox convention as lucide so it drops into any icon slot.
 */
export function FacebookIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 21v-7.8h2.6l.4-3h-3v-1.93c0-.87.24-1.46 1.5-1.46h1.6V4.14c-.28-.04-1.23-.12-2.34-.12-2.32 0-3.9 1.42-3.9 4.02V10.2H7.7v3h2.66V21h3.14Z" />
    </svg>
  );
}
