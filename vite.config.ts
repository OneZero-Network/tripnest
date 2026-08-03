import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'

/**
 * A build stamp the running app can display.
 *
 * Without this there is no way to tell, from inside an installed APK, which
 * commit it was built from — so an old APK looks identical to a new one and
 * source changes appear to "do nothing". CI sets GITHUB_SHA; local builds
 * fall back to git, then to 'dev'.
 */
function buildId(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  plugins: [react()],
  // Relative base is REQUIRED: Capacitor serves the bundle from file:// on Android.
  base: './',
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  build: { outDir: 'dist', sourcemap: false },
})
