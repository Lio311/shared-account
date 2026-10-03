import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'חשבון משותף',
        short_name: 'חשבון משותף',
        lang: 'he',
        dir: 'rtl',
        description: 'מערכת לניהול החשבון המשותף של ליאור וליאור',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'mutual-logo.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: 'mutual-logo.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        importScripts: ['/push-sw.js']
      }
    })
  ],
})
