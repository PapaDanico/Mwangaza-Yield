import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Roboto, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jetbrains' });
import Navbar from '@/components/shared/Navbar';
import AppInit from '@/components/shared/AppInit';

export const metadata: Metadata = {
  metadataBase: new URL('https://mwangazayield.netlify.app'),
  title: 'Mwangaza Yield — Kenyan Bond Intelligence',
  description:
    'Sovereign yields, crystal clear. Tax-adjusted yield analytics, auction radar and portfolio tracking for Kenyan government bond investors.',
  openGraph: {
    title: 'Mwangaza Yield — Sovereign yields, crystal clear.',
    description: 'Tax-adjusted analytics for Kenya’s bond market.',
    images: ['/og.png'],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mwangaza Yield — Sovereign yields, crystal clear.',
    description: 'Tax-adjusted analytics for Kenya’s bond market.',
    images: ['/og.png'],
  },
  manifest: '/manifest.json',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#F7F2E7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${roboto.variable} ${jetbrains.variable}`}>
      <body>
        <AppInit />
        <Navbar />
        <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 md:pb-10">{children}</main>
        <footer className="no-print mx-auto max-w-6xl px-4 pb-24 pt-2 text-xs text-ink-faint md:pb-8">
          Mwangaza Yield provides analytics for education only — not investment advice. Verify all
          figures against official CBK/NSE publications before investing.
        </footer>
      </body>
    </html>
  );
}
