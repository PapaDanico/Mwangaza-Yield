import type { Metadata, Viewport } from 'next';
import './globals.css';
import Navbar from '@/components/shared/Navbar';
import AppInit from '@/components/shared/AppInit';

export const metadata: Metadata = {
  title: 'Mwangaza Yield — Kenyan Bond Intelligence',
  description:
    'Tax-adjusted yield analytics, auction radar and portfolio tracking for Kenyan government bond investors.',
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#0A192F',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppInit />
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-24 pt-2 text-xs text-slate-500 md:pb-8">
          Mwangaza Yield provides analytics for education only — not investment advice. Verify all
          figures against official CBK/NSE publications before investing.
        </footer>
      </body>
    </html>
  );
}
