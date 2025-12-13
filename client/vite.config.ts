import { defineConfig } from 'vite'

// Build-time base path for assets. If you're hosting the site under a subpath
// (e.g., https://dashboard.victorysync.com/dashboard/), set VITE_BASE_PATH
// to "/dashboard/" during the build step so asset links use that prefix.
const basePath = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: basePath,
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
})
