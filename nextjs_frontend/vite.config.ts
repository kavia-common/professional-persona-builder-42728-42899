import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

/**
 * Tries to infer a /proxy/<port> prefix from a request URL.
 * Example input:
 *   https://host.example.com/proxy/3000/@vite/client
 * Returns:
 *   /proxy/3000
 */
function inferProxyPrefixFromUrl(rawUrl: string): string | null {
  try {
    const u = new URL(rawUrl)
    const m = u.pathname.match(/^\/proxy\/\d+/)
    return m ? m[0] : null
  } catch {
    // rawUrl may already be a path; ignore.
    return null
  }
}

export default defineConfig(({ mode }) => {
  // Load all env vars (no prefix filtering) so we can optionally use a Vite-specific override.
  // This avoids hardcoding preview hostnames/paths into the repo.
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * If the app is accessed through a path-prefix proxy (e.g. .../proxy/3000/),
   * Vite's dev client may otherwise generate absolute URLs like /@vite/client
   * which bypass the proxy prefix and 404.
   *
   * `server.origin` is the most reliable way to force correct dev-client absolute URLs.
   *
   * In this repo, env vars like NEXT_PUBLIC_FRONTEND_URL are not guaranteed to exist,
   * so we also auto-detect the /proxy/<port> prefix from the incoming request host.
   *
   * Expected origin example:
   *   https://vscode-internal-xxxx.cloud.kavia.ai/proxy/3000
   *
   * Note: origin should NOT include a trailing slash.
   */
  const configuredOrigin = env.VITE_DEV_SERVER_ORIGIN || env.NEXT_PUBLIC_FRONTEND_URL

  return {
    /**
     * Keep asset URLs relative so builds and dev work under path prefixes.
     * This complements `server.origin` (which covers the Vite dev client absolute URLs).
     */
    base: './',
    plugins: [
      // The React and Tailwind plugins are both required for Make, even if
      // Tailwind is not being actively used – do not remove them
      react(),
      tailwindcss(),

      /**
       * Auto-detect preview proxy prefix (/proxy/<port>) at runtime and set server.origin
       * so Vite dev client assets don't 404.
       *
       * This is intentionally minimal and only kicks in when origin is not already configured.
       */
      {
        name: 'kavia-proxy-origin-autodetect',
        configureServer(server) {
          if (configuredOrigin) return

          server.middlewares.use((req, _res, next) => {
            // Only infer once; afterwards Vite will generate correct URLs.
            if (server.config.server.origin) return next()

            const forwardedProto = (req.headers['x-forwarded-proto'] as string | undefined) || undefined
            const proto = forwardedProto || 'http'
            const host = req.headers.host
            if (!host) return next()

            const prefix =
              inferProxyPrefixFromUrl(`${proto}://${host}${req.url || '/'}`) ||
              // Some proxies may expose the original URL in a header
              (typeof req.headers['x-original-url'] === 'string'
                ? inferProxyPrefixFromUrl(`${proto}://${host}${req.headers['x-original-url']}`)
                : null)

            if (!prefix) return next()

            // Ensure no trailing slash; Vite expects origin like https://host/proxy/3000
            server.config.server.origin = `${proto}://${host}${prefix}`
            return next()
          })
        },
      },
    ],
    resolve: {
      alias: {
        // Alias @ to the src directory
        '@': path.resolve(__dirname, './src'),
      },
    },

    server: {
      host: true, // equivalent to 0.0.0.0
      port: 3000,
      strictPort: true,

      // If explicitly configured, honor it. Otherwise, the plugin above will infer it on first request.
      ...(configuredOrigin ? { origin: configuredOrigin } : {}),

      /**
       * Allow access when the dev server is reached through the VSCode internal preview/proxy URL.
       * Without this, Vite blocks requests with: "Blocked request. Host is not allowed".
       */
      allowedHosts: [
        // Exact host observed in the user report
        'vscode-internal-38734-beta.beta01.cloud.kavia.ai',

        // Future-proof common variants in this environment
        '.cloud.kavia.ai',
        '.beta01.cloud.kavia.ai',
      ],
    },

    // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
    assetsInclude: ['**/*.svg', '**/*.csv'],
  }
})
