import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.tripnest.app',
  appName: 'TripNest',
  webDir: 'dist',
  android: {
    // Keeps the WebView background matching the app shell during cold start.
    backgroundColor: '#F6F7F9',
  },
}

export default config
