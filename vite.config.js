import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), './src'),
      '@server': path.resolve(process.cwd(), './server'),
      // Shared by the backend classifier and the frontend UI, so a category
      // rename can never drift between the two.
      '@shared': path.resolve(process.cwd(), './shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Everything under /api is handled by the Node backend during development.
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion'],
          radix: [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js', 'tests/**/*.test.jsx'],
    setupFiles: ['tests/setup.js'],
    globals: true,
    testTimeout: 30000,
    // Component tests need a DOM; server tests are faster and more honest
    // without one.
    environmentMatchGlobs: [['tests/**/*.test.jsx', 'jsdom']],
  },
})
