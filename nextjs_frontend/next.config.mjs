/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The app uses `@import url(...)` in CSS for Inter fonts.
  // Next.js requires explicit allow-listing for these remote styles.
  experimental: {
    // Keep default; no App Router flags required (it's default in Next 13+).
  },

  /**
   * Proxy backend API calls when the frontend is served separately from the Express backend.
   *
   * This protects against same-origin 404s (e.g. POST /uploads/documents) when the frontend
   * mistakenly uses relative URLs, and it enables deployments where the browser must call
   * the frontend origin only.
   *
   * Note: the frontend API client should still prefer NEXT_PUBLIC_API_BASE for clarity.
   */
  async rewrites() {
    const backend =
      process.env.NEXT_PUBLIC_API_BASE ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'http://localhost:3001';

    return [
      { source: '/uploads/:path*', destination: `${backend}/uploads/:path*` },
      { source: '/orchestration/:path*', destination: `${backend}/orchestration/:path*` },
      { source: '/builds/:path*', destination: `${backend}/builds/:path*` },
      { source: '/documents/:path*', destination: `${backend}/documents/:path*` },
      { source: '/personas/:path*', destination: `${backend}/personas/:path*` },
      { source: '/ai/:path*', destination: `${backend}/ai/:path*` },
      { source: '/extraction/:path*', destination: `${backend}/extraction/:path*` },
      { source: '/health/:path*', destination: `${backend}/health/:path*` },
      { source: '/', destination: `${backend}/` },
    ];
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
