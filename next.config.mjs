/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    // One unified Content-Security-Policy for both dev and production.
    //
    // 'unsafe-inline' on script-src is a deliberate, considered trade-off,
    // not an oversight: this app mixes statically pre-rendered pages
    // (dashboard, products, most of the UI) with dynamically rendered ones
    // (/products/[id]). Next.js's App Router injects small inline <script>
    // tags on every page to deliver hydration/RSC payload data. A
    // per-request nonce (the usual way to allow specific inline scripts
    // without 'unsafe-inline') only works on dynamically rendered pages —
    // a statically pre-rendered page's HTML is generated once at build
    // time, before any request (and its nonce) exists, so Next.js has no
    // way to stamp a matching nonce onto that page's inline scripts. A
    // nonce-only policy was tried and confirmed broken here: it produced a
    // blank page on every statically rendered route, verified by directly
    // auditing the rendered HTML's <script> tags for nonce coverage rather
    // than assuming — curl alone cannot catch this, since CSP is enforced
    // by the browser at fetch/execute time, not reflected in raw HTML.
    //
    // The actual XSS exposure this trades away is low for this app
    // specifically: every value rendered to the page goes through React,
    // which escapes it by default, and nothing here uses
    // dangerouslySetInnerHTML anywhere (see SECURITY.md). 'self' still
    // blocks the thing that matters most day to day — any third-party or
    // externally-hosted script — which is what stops a compromised
    // dependency or a malicious embed from running.
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; ');

    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
export default nextConfig;
