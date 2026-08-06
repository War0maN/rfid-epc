import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    // PORT env (жишээ нь preview харнесс) өгөгдвөл түүнийг ашиглана, үгүй бол Vite default (5173)
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
  },
})
