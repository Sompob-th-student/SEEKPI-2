import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // '/seekpi-2/' for the on-prem Express server; Cloudflare builds use VITE_BASE=/ (see ../cloudflare/README-DEPLOY.md)
  base: process.env.VITE_BASE || '/seekpi-2/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4000' },
  },
})
