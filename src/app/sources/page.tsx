import type { Metadata } from 'next';
import { CheckCircle2, MinusCircle, XCircle, ExternalLink } from 'lucide-react';
import Prose from '@/components/shared/Prose';

export const metadata: Metadata = {
  title: 'Data sources — Mwangaza Yield',
  description: 'Every source behind Mwangaza Yield, what it is used for, and why some sources are deliberately not used.',
};

type Status = 'live' | 'reference' | 'declined';

const STATUS: Record<Status, { Icon: typeof CheckCircle2; cls: string; label: string }> = {
  live: { Icon: CheckCircle2, cls: 'text-mint-700', label: 'In the app' },
  reference: { Icon: MinusCircle, cls: 'text-gold-700', label: 'Linked, not copied' },
  declined: { Icon: XCircle, cls: 'text-slate-500', label: 'Not used' },
};

const SOURCES: { name: string; url: string; status: Status; used: string; why: string }[] = [
  {
    name: 'Central Bank of Kenya',
    url: 'https://www.centralbank.go.ke/',
    status: 'live',
    used: 'Bond prospectuses, auction results, T-bill rates, exchange rates, reserves, and the full Central Bank Rate history since 2008',
    why: 'The primary authority for everything we compute. Published as public PDFs and tables. Every rate decision we chart links back to the MPC press release it came from, so you can check us against the original.',
  },
  {
    name: 'Kenya National Bureau of Statistics',
    url: 'https://www.knbs.or.ke/',
    status: 'live',
    used: 'Monthly CPI / inflation',
    why: 'Needed to state real (after-inflation) yields rather than nominal ones.',
  },
  {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org/country/kenya',
    status: 'live',
    used: 'GDP growth and structural indicators',
    why: 'Free, keyless, versioned JSON API under CC BY 4.0 — the only major source on our list we may lawfully redistribute.',
  },
  {
    name: 'National Treasury',
    url: 'https://www.treasury.go.ke/',
    status: 'live',
    used: 'Public debt stock and debt-to-GDP',
    why: 'The debt burden is the single best indicator of whether yields stay high — and whether they are sustainable.',
  },
  {
    name: 'Nairobi Securities Exchange',
    url: 'https://www.nse.co.ke/',
    status: 'reference',
    used: 'Linked only — the free daily list is a scanned image',
    why: 'Verified July 2026: the Daily Bond Price List is published as scanned images with no text layer, so it cannot be read by software. We will not OCR it — a misread digit in a bond price is a wrong number stated with full confidence. Bulk machine-readable data requires a commercial licence.',
  },
  {
    name: 'IMF — Kenya country page',
    url: 'https://www.imf.org/en/Countries/KEN',
    status: 'reference',
    used: 'Debt sustainability analysis, Article IV projections',
    why: 'Cited for context in our figures; the reports themselves are worth reading in full at source.',
  },
  {
    name: 'Broker & bank research (Cytonn, NCBA, Sterling, Genghis)',
    url: 'https://cytonn.com/',
    status: 'reference',
    used: 'Cross-checking our figures during development',
    why: 'Copyrighted research. We read it, we do not republish it, and we do not present anyone else’s analysis as ours.',
  },
  {
    name: 'Business Daily, The Standard and other press',
    url: 'https://www.businessdailyafrica.com/',
    status: 'reference',
    used: 'Auction results before the official PDF is indexed',
    why: 'Useful for timeliness, always superseded by the CBK original once available.',
  },
  {
    name: 'Trading Economics',
    url: 'https://tradingeconomics.com/kenya',
    status: 'declined',
    used: '—',
    why: 'The API requires a key, and this app ships as static files with no server to hold one. Redistribution also sits outside their terms.',
  },
  {
    name: 'Investing.com / Yahoo Finance (yfinance)',
    url: 'https://www.investing.com/',
    status: 'declined',
    used: '—',
    why: 'Unofficial or scraping-restricted endpoints. We will not build a money tool on an interface that can vanish or that we are not permitted to use.',
  },
  {
    name: 'Central Depository & Settlement Corporation',
    url: 'https://www.cdsc.co.ke/',
    status: 'declined',
    used: '—',
    why: 'Data is available to market participants only. Your holdings stay between you and your CSD account.',
  },
];

export default function SourcesPage() {
  return (
    <Prose
      title="Where our numbers come from"
      lead="Every source we use, what it feeds, and — just as important — what we deliberately do not use."
      updated="25 July 2026"
    >
      <p>
        A tool that tells you what to do with your money owes you a straight answer about where
        its numbers came from. This page is that answer. It also lists sources we evaluated and
        rejected, because &ldquo;we could have used this but chose not to&rdquo; is information too.
      </p>

      <div className="space-y-3">
        {SOURCES.map((s) => {
          const { Icon, cls, label } = STATUS[s.status];
          return (
            <div key={s.name} className="rounded-xl border border-sand-300 bg-sand-50 p-4">
              <div className="flex items-start gap-2.5">
                <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-display font-semibold text-ink">
                      {s.name}
                    </a>
                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${cls}`}>{label}</span>
                  </div>
                  {s.status !== 'declined' && (
                    <p className="mt-1 text-xs text-ink-muted">
                      <strong className="text-ink-soft">Feeds:</strong> {s.used}
                    </p>
                  )}
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">{s.why}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <h2>Why so much is &ldquo;linked, not copied&rdquo;</h2>
      <p>
        Mwangaza Yield is a static application: it has no server, so it can hold no API keys and
        run no private queries. That rules out every paid or authenticated feed. It also means we
        cannot lawfully mirror licensed market data or copyrighted research. Rather than pretend
        otherwise, we compute everything we can from public primary sources and send you to the
        original for the rest.
      </p>
      <p>
        The upside of that constraint is real: no key means no server, no server means no account,
        and no account means your portfolio never leaves your device.
      </p>

      <h2>Freshness and honesty</h2>
      <ul>
        <li>Auction results and rates carry the date of the auction they came from.</li>
        <li>
          The rate-cycle chart compares today against the level the <em>current</em> cycle
          started from, not the 2011 record high. Measuring against the record would show a
          fall that never happened as a single move.
        </li>
        <li>Coupon dates are estimated from issue schedules and are labelled as estimates wherever they appear.</li>
        <li>Yields without a published auction print are interpolated from the prevailing curve, and say so.</li>
        <li>When the app is offline it shows a badge, so a cached figure is never mistaken for a live one.</li>
      </ul>
      <p>
        Spotted a figure that disagrees with the official source? That is the most valuable bug you
        can report — see <a href="/support/">Support</a>.
      </p>

      <h2>Attribution</h2>
      <p>
        World Bank Open Data is used under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY 4.0 <ExternalLink size={11} className="inline" />
        </a>
        . CBK, KNBS, National Treasury and NSE materials remain the property of their publishers and
        are used for information with attribution.
      </p>
    </Prose>
  );
}
