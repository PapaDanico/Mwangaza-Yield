import Link from 'next/link';
import { MessageCircle, Mail } from 'lucide-react';
import {
  CBK_WHATSAPP_CHANNEL,
  PESA_SMART_CHANNEL,
  PESA_SMART_NAME,
  SUPPORT_EMAIL,
} from '@/lib/share';

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
      { href: '/macro/', label: 'Economic Context' },
      { href: '/tbills/', label: 'Treasury Bills' },
      { href: '/auctions/', label: 'Auction Radar' },
      { href: '/yield-curve/', label: 'Yield curve history' },
      { href: '/learn/', label: 'Tutorials' },
      { href: '/glossary/', label: 'Plain English' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { href: '/about/', label: 'About us' },
      { href: '/sources/', label: 'Data sources' },
      { href: '/feed/', label: 'Free rates feed' },
      { href: '/faq/', label: 'FAQs' },
      { href: '/support/', label: 'Support' },
      { href: '/licensing/', label: 'How this is funded' },
      { href: 'https://jipangefinance.org/', label: 'JiPange: everyday money tools' },
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

function LinkList({ links }: { links: { href: string; label: string }[] }) {
  return (
    <ul className="mt-1 space-y-1">
      {links.map((l) => (
        <li key={l.href}>
          <Link
            href={l.href}
            className="block py-3 text-sm text-sand-300/70 transition hover:text-gold-500"
          >
            {l.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default function Footer() {
  return (
    <footer className="no-print mt-16 bg-treasury-navy pb-24 pt-12 md:pb-12">
      <div className="mx-auto max-w-7xl px-4">
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
              Government bonds, made plain
            </p>
            <p className="mt-4 hidden max-w-xs text-sm leading-relaxed text-sand-300/70 sm:block">
              A free, private tool that shows what Kenyan government bonds really pay once tax is
              taken off — so an ordinary saver can decide with the same clarity a bank does.
            </p>
            {/* `grow` so this row finishes flush however it wraps.
                These three are bordered chips, not text links: at 768px on a
                machine whose fonts run slightly wider they stop sharing lines
                and stack one per row at 149/132/110px, with three drawn right
                edges in three different places. Locally they split 1-then-2
                and looked fine, which is exactly why this needed measuring on
                another machine rather than eyeballing.
                `grow` states the rule without a breakpoint: a chip alone on
                its line fills it, chips that share one finish flush. */}
            <div className="mt-5 flex flex-wrap gap-2">
              <a
                href={CBK_WHATSAPP_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex grow items-center gap-1.5 rounded-lg border border-mint-600/50 px-3.5 py-3.5 text-xs font-medium text-mint-500 transition hover:bg-mint-600/10"
              >
                <MessageCircle size={13} /> CBK on WhatsApp
              </a>
              {/* Gold rather than mint, so the two WhatsApp links in this row
                  are not read as one thing. CBK's is the source; this is ours. */}
              <a
                href={PESA_SMART_CHANNEL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex grow items-center gap-1.5 rounded-lg border border-gold-500/50 px-3.5 py-3.5 text-xs font-medium text-gold-400 transition hover:bg-gold-500/10"
              >
                <MessageCircle size={13} /> {PESA_SMART_NAME}
              </a>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="inline-flex grow items-center gap-1.5 rounded-lg border border-sand-300/25 px-3.5 py-3.5 text-xs font-medium text-sand-300/80 transition hover:bg-sand-50/5 hover:text-sand-50"
              >
                <Mail size={13} /> Contact us
              </a>
            </div>
          </div>

          {/* Phones: four folded groups (about 200px) instead of two columns of
              44px links (about 800px); the same links, native <details>. */}
          <div className="sm:hidden">
            {COLUMNS.map((col) => (
              <details key={col.heading} className="group border-b border-sand-300/15">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-display text-sm font-bold text-sand-50 marker:content-none">
                  {col.heading}
                  <span aria-hidden className="text-lg text-gold-500 transition-transform group-open:rotate-45">+</span>
                </summary>
                <LinkList links={col.links} />
              </details>
            ))}
          </div>

          <div className="hidden grid-cols-4 gap-8 sm:grid">
            {COLUMNS.map((col) => (
              <div key={col.heading}>
                <p className="font-display text-sm font-bold text-sand-50">
                  {col.heading}
                </p>
                {/* Measured at 390px: these links were 16px tall on a 32px
                    pitch, so a fingertip spanned one and a half of them and a
                    tap in the 16px dead band did nothing at all. `block py-3`
                    lifts each hit area to 44px without moving the text; the
                    4px `space-y-1` keeps a boundary between them so a near-miss
                    stays a miss rather than navigating somewhere unasked-for. */}
                <LinkList links={col.links} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-10 border-t border-sand-300/15 pt-6">
          {/* /70, not /50. At half opacity over the navy footer this measured
              3.99:1 against a 4.5 floor — and of everything on the page, the
              line that says "not investment advice" is the worst one to make
              hard to read. It sits below the fold, which is why a scan limited
              to the first screenful never saw it. */}
          <p className="text-xs leading-relaxed text-sand-300/70">
            Mwangaza Yield provides analytics for education only and is <strong>not investment
            advice</strong>, nor an offer to buy or sell securities. We are not affiliated with, or
            endorsed by, the Central Bank of Kenya, the Nairobi Securities Exchange or the Capital
            Markets Authority. Figures are derived from published CBK, National Treasury and KNBS data and may be
            delayed, estimated or incorrect — verify every number against the official prospectus
            before you invest. Capital is at risk; yields change at every auction.
          </p>
          <p className="mt-4 text-xs text-sand-300/60">
            © {new Date().getFullYear()} Mwangaza Yield · Built in Kenya 🇰🇪
          </p>
        </div>
      </div>
    </footer>
  );
}
