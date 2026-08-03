/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0B0F14', soft: '#414A55', mute: '#7B8695' },
        surface: { DEFAULT: '#FFFFFF', sunk: '#F5F7F9', line: '#E6E9ED' },
        brand: { DEFAULT: '#10B981', deep: '#059669', dark: '#047857', wash: '#ECFDF5' },
        accent: { DEFAULT: '#2563EB', wash: '#EFF4FF' },
        signal: { pos: '#059669', neg: '#E5484D', warn: '#B4790B', info: '#2563EB' },
      },
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,15,20,0.04), 0 8px 24px -14px rgba(11,15,20,0.14)',
        lift: '0 2px 6px rgba(11,15,20,0.06), 0 24px 48px -20px rgba(11,15,20,0.26)',
        hero: '0 8px 28px -10px rgba(5,150,105,0.45)',
      },
      borderRadius: { xl2: '20px', xl3: '26px' },
    },
  },
  plugins: [],
}
