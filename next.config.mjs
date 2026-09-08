/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'standalone',
  experimental: { optimizePackageImports: ['lucide-react'] },
  async headers() {
    // 'unsafe-inline' on script-src is a deliberate trade-off, not an
    // oversight. This app mixes statically pre-rendered pages (most of the
    // UI) with dynamically rendered ones. Next.js injects small inline
    // <script> tags on every page for hydration. A per-request nonce (the
    // usual alternative to 'unsafe-inline') only works on dynamically
    // rendered pages — a static page's HTML is built once, in advance,
    // before any request exists, so there's no way to stamp a matching
    // nonce onto it. Nonces were tried and produced a blank page on every
    // static route. React escapes all rendered content by default, and
    // this app never uses dangerouslySetInnerHTML, which keeps the actual
    // risk low. 'self' still blocks the thing that matters most day to
    // day: any third-party or externally-hosted script.
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