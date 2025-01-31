import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist'
  },
  server: {
    proxy: {
      '/auth': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false
      },
      '/connect/discord': {
        target: 'http://localhost:3002',
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
        target: 'http://localhost:3002',
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
  }
});