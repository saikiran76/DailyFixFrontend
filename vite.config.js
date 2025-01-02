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
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/discord': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      },
      '/connect/discord/callback': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward the authorization header
            const token = req.headers.authorization;
            if (token) {
              proxyReq.setHeader('Authorization', token);
            }

            // Log the request for debugging
            console.log('Discord callback request:', {
              method: req.method,
              url: req.url,
              hasAuth: !!token
            });
          });
        }
      },
      '/connect': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false
      }
    }
  }
})