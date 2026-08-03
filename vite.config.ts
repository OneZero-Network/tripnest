import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base is REQUIRED: Capacitor serves the bundle from file:// on Android.
  base: './',
  build: { outDir: 'dist', sourcemap: false },
})
