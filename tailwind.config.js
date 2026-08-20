/* eslint-disable @typescript-eslint/no-var-requires */
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
          // Contrast is measured against the DARKEST surface each token lands
          // on, not the lightest. The previous values were checked only against
          // sand-50 (cards) and annotated "passes AA" — but most muted text sits
          // on sand-100 (the page) and some on sand-200, where #64748B fell to
          // 4.26 and 3.87. Verified at the token level, failing where rendered.
          //                      sand-50 / sand-100 / sand-200
          muted: '#5C687A',   //    5.46 /   5.06   /   4.59
          faint: '#6A6555',   //    5.63 /   5.22   /   4.73
        },
        // Brand palette: Treasury Navy, Sun Gold, Emerald Mint, Slate Gray
        treasury: { navy: '#0A192F', dark: '#020C1B' },
        slate: { 500: '#64748B' },
        // A COMPLETE ramp, on purpose. It used to hold 300/500/600/700 only,
        // and twelve places across the app had reached for 50, 100, 400 and
        // 800 anyway — Tailwind emits nothing for a step that does not exist,
        // so each of those rendered with no colour at all and no error
        // anywhere. The footer's Pesa Smart link was dark text on navy; the
        // stale-price badge in PriceProvenance lost both its amber background
        // and its dark amber text and read as ordinary body copy, which is the
        // opposite of what a caution badge is for.
        //
        // Values are the Tailwind amber ramp, which is what 300/500/600/700
        // already were — so this fills the gaps in the scale that was being
        // used rather than inventing a second one. tests/unit/palette.test.ts
        // now fails on any utility naming a step that is not defined here.
        gold: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        mint: { 300: '#6EE7B7', 500: '#10B981', 600: '#059669', 700: '#047857', 800: '#065F46' },
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
