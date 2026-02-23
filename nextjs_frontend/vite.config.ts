import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
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

  /**
   * Ensure the dev server binds to the expected host/port in containerized preview environments.
   * Many orchestrators probe port 3000 and require binding to 0.0.0.0 (not just localhost).
   */
  server: {
    host: true, // equivalent to 0.0.0.0
    port: 3000,
    strictPort: true,

    /**
     * Allow access when the dev server is reached through the VSCode internal preview/proxy URL.
     * Without this, Vite blocks requests with: "Blocked request. Host is not allowed".
     *
     * Notes:
     * - Vite compares the Host header (hostname only, no scheme/path).
     * - The preview host typically looks like: vscode-internal-<id>-beta.beta01.cloud.kavia.ai
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
})
