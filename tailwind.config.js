/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0E1116', soft: '#3A414B', mute: '#78818F' },
        surface: { DEFAULT: '#FFFFFF', sunk: '#F6F7F9', line: '#E8EAEE' },
        signal: { pos: '#1F8A5B', neg: '#B4472E', warn: '#9A7B22', info: '#31527A' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14,17,22,0.04), 0 8px 24px -12px rgba(14,17,22,0.16)',
        lift: '0 2px 6px rgba(14,17,22,0.06), 0 24px 48px -20px rgba(14,17,22,0.28)',
      },
      borderRadius: { xl2: '20px' },
    },
  },
  plugins: [],
}
