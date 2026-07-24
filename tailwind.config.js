/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        treasury: { navy: '#0A192F', dark: '#020C1B' },
        gold: { 300: '#FCD34D', 500: '#F59E0B', 600: '#D97706' },
        card: { dark: '#1E293B' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
