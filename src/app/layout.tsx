import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Roboto, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' });
const jetbrains = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '600'], variable: '--font-jetbrains' });
import Navbar from '@/components/shared/Navbar';
import Footer from '@/components/shared/Footer';
import StaleDataNotice from '@/components/shared/StaleDataNotice';
import { readerNotice } from '@/lib/data-freshness';
import AppInit from '@/components/shared/AppInit';
import Analytics from '@/components/shared/Analytics';
import { Analytics as VercelAnalytics } from '@vercel/analytics/next';
import JourneyBar from '@/components/shared/JourneyBar';
import Breadcrumb from '@/components/shared/Breadcrumb';
import UpdateBanner from '@/components/shared/UpdateBanner';
import DataProvenanceFooter from '@/components/shared/DataProvenanceFooter';
import DataOfflineBanner from '@/components/shared/DataOfflineBanner';
import { CommandPaletteProvider } from '@/components/CommandPalette';
import { APP_URL } from '@/lib/share';

export const metadata: Metadata = {
  // Every relative URL in the metadata below — the og:image above all —
  // resolves against this. Pointing it at the Netlify subdomain would keep
  // serving link previews from an address we no longer publish.
  metadataBase: new URL(APP_URL),
  /* Self-referencing canonical, resolved per route against metadataBase.
     Verified against built HTML rather than assumed: if './' resolved to the
     site root instead of the current path it would point every page at the
     homepage, which is worse than having no canonical at all. */
  alternates: { canonical: './' },
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
        <Analytics />
        <VercelAnalytics />
        {/* The first thing a keyboard or screen-reader user meets. Without it
            every page makes them walk the whole nav — nine links, on every
            navigation — before reaching a word of content. Visually hidden
            until focused, so it costs sighted users nothing. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-treasury-navy focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-sand-50"
        >
          Skip to main content
        </a>
        <CommandPaletteProvider>
          <Navbar />
          <JourneyBar />
          <Breadcrumb />
          {/* min-h keeps the footer where it lands.
              Every short page — T-Bills, Calculator, Goals, Prices — measured
              0.5201 CLS at 390px, and the shifting element was the FOOTER on all
              four. Nothing was wrong with those pages: their content grows on
              hydration, the document gets taller, and a footer that had been
              sitting high on a short document drops half a viewport.
              Reserving a viewport's worth of main means the footer starts below
              the fold and stays there. */}
          {/* Above <main>, so it is read before the figures it qualifies rather
              than after them. Renders nothing in the ordinary case.

              The notice is computed HERE, in a server component, so that when
              the shipped data is already stale at build time the banner is
              present in the served HTML. Appearing on mount instead pushed
              <main> down 99px — one 0.0994 layout shift, most of the CLS
              budget, on every route. Staleness only increases, so a build-time
              "yes" cannot become a "no"; the component's effect keeps the
              wording current from there. See its header. */}
          <StaleDataNotice
            initialNotice={readerNotice(new Date())}
          />
          <DataOfflineBanner />
          <main
            id="main"
            className="mx-auto min-h-[calc(100vh-8rem)] max-w-6xl px-4 pt-6"
          >
            {children}
          </main>
          <DataProvenanceFooter />
          <Footer />
          <UpdateBanner />
        </CommandPaletteProvider>
      </body>
    </html>
  );
}
