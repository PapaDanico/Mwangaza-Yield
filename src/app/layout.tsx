import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Roboto, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jetbrains' });
import Navbar from '@/components/shared/Navbar';
import Footer from '@/components/shared/Footer';
import AppInit from '@/components/shared/AppInit';

export const metadata: Metadata = {
  metadataBase: new URL('https://mwangazayield.netlify.app'),
  title: 'Mwangaza Yield — Government bonds, made plain',
  description:
    'When you lend to Kenya, know what you earn. See what a government bond really pays after tax, in plain language, before you commit a shilling. Free, private, works offline.',
  // This is the WhatsApp preview. For a Kenyan audience that is the main way
  // the app will be met for the first time, so it carries the same words as
  // the page it opens — not the tagline we retired.
  openGraph: {
    title: 'When you lend to Kenya, know what you earn',
    description:
      'What a government bond really pays after tax — in plain language, before you commit a shilling.',
    images: ['/og.png'],
    type: 'website',
    locale: 'en_KE',
    siteName: 'Mwangaza Yield',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'When you lend to Kenya, know what you earn',
    description:
      'What a government bond really pays after tax — in plain language, before you commit a shilling.',
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
        <main className="mx-auto max-w-6xl px-4 pt-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
