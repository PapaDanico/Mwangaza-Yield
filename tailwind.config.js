/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Earthy light system — navy is the ink, cream/khaki the ground
        sand: {
          50: '#FDFBF5',   // card surface
          100: '#F7F2E7',  // page background
          200: '#EFE7D5',  // recessed surface
          300: '#E3D8BE',  // borders
          400: '#CBBD9C',  // strong borders / khaki
        },
        ink: {
          DEFAULT: '#0A192F', // treasury navy as text
          soft: '#31445F',
          muted: '#67737F',
          faint: '#726D5C',   // warm earthy muted — AA on sand-50 at small sizes
        },
        treasury: { navy: '#0A192F', dark: '#020C1B' },
        gold: { 300: '#FCD34D', 500: '#F59E0B', 600: '#D97706', 700: '#B45309' },
        mint: { 500: '#10B981', 600: '#059669', 700: '#047857' },
      },
      fontFamily: {
        display: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-roboto)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(10, 25, 47, 0.05), 0 4px 16px rgba(10, 25, 47, 0.06)',
      },
    },
  },
  plugins: [],
};
