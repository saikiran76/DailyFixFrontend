import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
    sourcemap: true,
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://23.22.150.97:3002/',
        changeOrigin: true,
        secure: false
      },
      '/connect/discord': {
        target: 'http://23.22.150.97:3002/',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Discord Request:', {
              original: req.url,
              rewritten: proxyReq.path,
              headers: proxyReq.getHeaders()
            });
          });
        }
      },
      '/discord': {
        target: 'http://23.22.150.97:3002/',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => `/connect${path}`,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Discord Request (rewritten):', {
              original: req.url,
              rewritten: proxyReq.path,
              headers: proxyReq.getHeaders()
            });
          });
        }
      }
    }
  },
  base: '/',
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});