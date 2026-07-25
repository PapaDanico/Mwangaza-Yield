import Link from 'next/link';
import { MessageCircle, Github } from 'lucide-react';
import { CBK_WHATSAPP_CHANNEL } from '@/lib/share';

const COLUMNS = [
  {
    heading: 'Plan',
    links: [
      { href: '/goals/', label: 'Plan by objective' },
      { href: '/ladder/', label: 'Ladder Builder' },
      { href: '/calculator/', label: 'Net Yield Calculator' },
      { href: '/portfolio/', label: 'My Portfolio' },
    ],
  },
  {
    heading: 'Market',
    links: [
      { href: '/dashboard/', label: 'Dashboard' },
      { href: '/tbills/', label: 'Treasury Bills' },
      { href: '/auctions/', label: 'Auction Radar' },
      { href: '/learn/', label: 'Tutorials' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about/', label: 'About us' },
      { href: '/sources/', label: 'Data sources' },
      { href: '/faq/', label: 'FAQs' },
      { href: '/support/', label: 'Support' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { href: '/terms/', label: 'Terms of use' },
      { href: '/privacy/', label: 'Privacy policy' },
      { href: '/disclaimer/', label: 'Risk disclaimer' },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="no-print mt-16 bg-treasury-navy pb-24 pt-12 md:pb-12">
      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 md:grid-cols-[1.4fr,2.6fr]">
          <div>
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.svg" alt="" className="h-10 w-10 rounded-xl" />
              <span className="font-display text-lg font-bold tracking-tight text-sand-50">
                Mwangaza <span className="text-gold-500">Yield</span>
              </span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-[0.2em] text-gold-500/80">
              Intelligence layer for Kenya&apos;s bond market
            </p>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-sand-300/70">
              Free, offline-first analytics that show what government securities really pay after
              Kenyan withholding tax — so retail investors bid with the same clarity institutions do.
            </p>
            <div className="mt-5 flex gap-2">
              <a
                href={CBK_WHATSAPP_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-mint-600/50 px-3 py-1.5 text-xs font-medium text-mint-500 transition hover:bg-mint-600/10"
              >
                <MessageCircle size={13} /> CBK on WhatsApp
              </a>
              <a
                href="https://github.com/PapaDanico/Mwangaza-Yield"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-sand-300/20 px-3 py-1.5 text-xs font-medium text-sand-300/70 transition hover:bg-sand-50/5"
              >
                <Github size={13} /> Source
              </a>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="font-display text-xs font-bold uppercase tracking-wider text-sand-50">
                  {col.heading}
                </p>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-sm text-sand-300/70 transition hover:text-gold-500">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-sand-300/15 pt-6">
          <p className="text-xs leading-relaxed text-sand-300/50">
            Mwangaza Yield provides analytics for education only and is <strong>not investment
            advice</strong>, nor an offer to buy or sell securities. We are not affiliated with, or
            endorsed by, the Central Bank of Kenya, the Nairobi Securities Exchange or the Capital
            Markets Authority. Figures are derived from published CBK, NSE and KNBS data and may be
            delayed, estimated or incorrect — verify every number against the official prospectus
            before you invest. Capital is at risk; yields change at every auction.
          </p>
          <p className="mt-4 text-xs text-sand-300/40">
            © {new Date().getFullYear()} Mwangaza Yield · Built in Kenya 🇰🇪
          </p>
        </div>
      </div>
    </footer>
  );
}
