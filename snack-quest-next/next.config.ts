import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // The parent Snack-Quest repo also has a package-lock.json, which makes
  // Next.js misdetect the workspace root. Pin it explicitly to this
  // project's own directory.
  //
  // Deliberately NOT also setting `outputFileTracingRoot` here to match:
  // Vercel injects its own value (`/vercel/path0`) via its post-build
  // "Deploying outputs" step, which needs that exact value to locate
  // `.next/package.json` when assembling serverless functions — an
  // explicit override here works fine for `next build` itself (which
  // silences the "must have the same value" warning) but breaks that
  // later Vercel-only step with `ENOENT: .next/package.json`, since the
  // two roots then genuinely disagree on Vercel's own infrastructure.
  // The warning is cosmetic; a broken deploy is not — leave this unset
  // and let Vercel's own value win, same as it already does today.
  turbopack: {
    root: path.join(__dirname),
  },
  // firebase-admin/auth → jwks-rsa → jose@6, which is pure ESM with no
  // CJS export at all. Kept explicit (firebase-admin alone is already on
  // Next's default list) so the whole chain is loaded by Node itself
  // rather than inlined into the server bundle — Node's own require()
  // has handled require(ESM) since 22.12, which is what makes this work.
  // See the `--webpack` note on the build script in package.json for why
  // the bundler choice matters here.
  serverExternalPackages: ['firebase-admin', 'jwks-rsa', 'jose'],
  // `app/(marketing)/opengraph-image.tsx` reads `public/logo.png` off
  // disk at request time, with a path built from `process.cwd()`.
  //
  // Next's output file tracing follows static `import`s; it cannot see
  // a path assembled at runtime, so the logo was never copied into the
  // serverless function bundle. Being in the repo is not enough on its
  // own: `public/` is uploaded to the CDN as static assets, which is a
  // different place from the function's filesystem. Every production
  // render therefore threw `ENOENT: /var/task/.../public/logo.png` and
  // returned a 500 — which is why every WhatsApp/X/Facebook link
  // preview of this site came back blank.
  //
  // The key is the *route* path, so the `(marketing)` route group is
  // absent from it by design (route groups never appear in a URL).
  outputFileTracingIncludes: {
    '/opengraph-image': ['./public/logo.png'],
  },
  images: {
    // Every uploaded image (snack/box photos, storage browser) lives in
    // Vercel Blob (services/storageService.ts) at
    // https://<store-id>.public.blob.vercel-storage.com/... — the store
    // id is fixed per deployment but not known at config time, hence the
    // wildcard. This lets next/image actually optimize marketing-site box
    // images instead of the `unoptimized` escape hatch other surfaces use.
    remotePatterns: [{ protocol: 'https', hostname: '*.public.blob.vercel-storage.com' }],
  },
  // § security audit — no response headers were set anywhere in this
  // app, which made clickjacking on the Admin/Creator/Finance/Agent/
  // Warehouse portals' real action buttons (approve a withdrawal,
  // issue a refund, mark an order dispatched) plausible: embed the
  // portal in an invisible iframe on an attacker's page and trick a
  // logged-in staff/creator into clicking through an overlay. Nothing
  // in this app legitimately gets embedded in another site's iframe,
  // so `frame-ancestors 'self'` (with `X-Frame-Options: SAMEORIGIN` as
  // a fallback for the handful of older browsers that don't read the
  // CSP form) has zero functional cost. `X-Content-Type-Options` stops
  // a browser from executing an upload/response as a different content
  // type than declared — also zero functional cost.
  //
  // Deliberately NOT a full Content-Security-Policy here: this app
  // loads the Meta Pixel and TikTok Pixel via inline `<Script>` tags
  // that both execute inline JS and load from `connect.facebook.net`/
  // `analytics.tiktok.com`, on top of Firebase Auth/Firestore and
  // Vercel Blob origins — a CSP strict enough to matter needs each of
  // those enumerated and verified page-by-page in a browser (nonces
  // for the inline scripts, exact `connect-src`/`img-src` origins) or
  // it silently breaks conversion tracking or the checkout flow in
  // production. That's real, scoped follow-up work, not something to
  // ship unverified inside a broader fix.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // The investor deck (`public/deck/`) is a document we hand to
      // specific people, not a page we want ranking under "snack quest
      // nairobi" — and once the funding figures on its use-of-funds
      // slide are filled in, letting Google keep a copy would publish
      // them.
      //
      // Deliberately NOT a `Disallow: /deck` in `app/robots.ts`:
      // robots.txt is itself a public file, so listing the path there
      // advertises the URL it is supposed to keep quiet, and a
      // disallowed URL can still be indexed by reference. `noindex`
      // lets the crawler fetch the page and tells it not to keep it,
      // which is the behavior actually wanted. Mirrored as a `<meta
      // name="robots">` inside the document so the instruction
      // survives the page being saved or served another way.
      {
        source: '/deck',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/deck/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ];
  },
  /*
   * `snackquests.shop/deck` → `public/deck/index.html`.
   *
   * The deck is a self-contained static document with its own design
   * system, so it is a file in `public/` rather than a route: a page
   * under `app/` would inherit the root layout's `globals.css`, whose
   * `:root` tokens collide with the deck's own, plus the site fonts,
   * providers and tracking pixels — none of which it wants.
   *
   * A rewrite rather than a redirect so the address bar keeps the
   * clean `/deck` the founder actually sends to people. Returning an
   * array (rather than the `beforeFiles`/`afterFiles` object form)
   * means this is checked only *after* the filesystem and `public/`,
   * so it can never shadow a real route.
   */
  async rewrites() {
    return [{ source: '/deck', destination: '/deck/index.html' }];
  },
};

export default nextConfig;
