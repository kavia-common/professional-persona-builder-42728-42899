/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app uses `@import url(...)` in CSS for Inter fonts.
  // Next.js requires explicit allow-listing for these remote styles.
  experimental: {
    // Keep default; no App Router flags required (it's default in Next 13+).
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          // Basic hardening; safe defaults for an SPA-like UI.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
