import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The inference worker picks the WebGPU or WASM-only ORT build at runtime (dynamic import).
  worker: { format: 'es' },
  // Pre-bundling breaks ORT's relative .wasm URLs in dev.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5002',
        changeOrigin: true,
      },
    },
  },
})
