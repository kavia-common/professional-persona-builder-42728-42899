import { defineConfig, loadEnv } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Load all env vars (no prefix filtering) so we can optionally use a Vite-specific override.
  // This avoids hardcoding preview hostnames/paths into the repo.
  const env = loadEnv(mode, process.cwd(), '')

  /**
   * If the app is accessed through a path-prefix proxy (e.g. .../proxy/3000/),
   * Vite's dev client may otherwise generate absolute URLs like /@vite/client
   * which bypass the proxy prefix and 404.
   *
   * Setting `server.origin` makes Vite generate the correct absolute URLs for the dev client.
   * Expected value example:
   *   https://vscode-internal-xxxx.cloud.kavia.ai/proxy/3000
   *
   * Note: origin should NOT include a trailing slash.
   */
  const serverOrigin = env.VITE_DEV_SERVER_ORIGIN || env.NEXT_PUBLIC_FRONTEND_URL

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

      // Critical for /proxy/3000 previews: makes /@vite/client resolve under the proxy prefix.
      ...(serverOrigin ? { origin: serverOrigin } : {}),

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
