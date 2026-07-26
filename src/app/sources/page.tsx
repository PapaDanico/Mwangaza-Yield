import type { Metadata } from 'next';
import { CheckCircle2, MinusCircle, XCircle, ExternalLink } from 'lucide-react';
import Prose from '@/components/shared/Prose';
import ArchiveCoverage from '@/components/sources/ArchiveCoverage';
import ArchiveDownload from '@/components/sources/ArchiveDownload';

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
    status: 'reference',
    used: 'The origin of the CPI figure we show — but read from CBK, not from KNBS directly',
    why: 'KNBS compiles the index; we take the number from CBK\u2019s own release because that is the copy we can fetch reliably. Our data file records the substitution against every reading, so the provenance is never guessed at.',
  },
  {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org/country/kenya',
    status: 'live',
    used: 'GDP growth, reserves (import cover), exports as a share of GDP, and the current account balance. Four figures — not the debt ones.',
    why: 'Free, keyless, versioned JSON API under CC BY 4.0 — the only major source on our list we may lawfully redistribute. This entry used to claim we also took public debt figures from here: debt to GDP, interest to revenue, external debt to GNI, debt service to exports. We ask the API for all four and it returns no observation for Kenya against any of them, so the app has never shown one. The scraper is right to skip what does not exist; the claim was wrong to stay on this page. Kenya’s debt numbers are published — the Treasury’s own bulletins and the Controller of Budget carry them — but we do not yet read a source that serves them in a form software can parse, so we show none.',
  },
  {
    name: 'National Treasury',
    url: 'https://www.treasury.go.ke/',
    status: 'reference',
    used: 'Not yet read by anything we run — linked so you can go to the primary record',
    why: 'This entry used to claim we took public debt figures from here. We did not, and the debt data we show comes from the World Bank. We probed the site directly: its Public Debt Management pages are reachable, but the debt documents they link — the yield curve and the outstanding-bonds schedule — both return 404 while the site is mid-migration. There is nothing machine-readable to read yet, so we read nothing and say so.',
  },
  {
    name: 'Nairobi Securities Exchange',
    // No link, deliberately. Sending readers to the Exchange to fetch figures
    // for this app is the behaviour the terms exist to prevent, and a link that
    // exists to be used that way is not meaningfully different from using it.
    url: '',
    status: 'declined',
    used: 'Nothing. We hold no exchange data and no agreement to use any.',
    why: 'We take no data from the Exchange, in any form, and nothing we publish is derived from it. Its terms make the data proprietary — not copyable, storable or distributable, and not usable to build a product — and that applies to what sits publicly on its website as much as to a paid feed. Reading a page in a browser does not make its contents free to redistribute. Rather than rely on being the kind of small use nobody minds, we removed the dependency: the scraper that could once fetch it is gone, and no configuration will bring it back. Everything on this page comes from CBK, the National Treasury, KNBS and the World Bank instead. If you want a market price for a bond, get it from your broker or from DhowCSD and enter it yourself — it stays on your device, and it is yours, not ours to publish.',
  },
  {
    name: 'IMF — Kenya country page',
    url: 'https://www.imf.org/en/Countries/KEN',
    status: 'reference',
    used: 'Not read by anything we run — linked because the reports are worth your time',
    why: 'Nothing here parses an Article IV or a debt sustainability analysis. They informed how we think about the debt figures we show; they are not a data feed, and we should not have implied otherwise.',
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
    name: 'KIPPRA',
    url: 'https://kippra.or.ke/',
    status: 'reference',
    used: 'Background reading on Kenyan public finance',
    why: 'Kenya’s public-policy research institute publishes genuinely useful analysis — the Kenya Economic Report and similar. It is prose and PDFs rather than structured data, and it is all rights reserved, so we cite and link rather than ingest.',
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
    name: 'Cbonds',
    url: 'https://cbonds.com/',
    status: 'declined',
    used: '—',
    why: 'A paid subscription service. Their Kenya page did not resolve when probed, and even if it had, redistributing licensed bond data in a free public app is not something a subscription permits.',
  },
  {
    name: 'AfricaFinancials',
    url: 'https://africanfinancials.com/',
    status: 'declined',
    used: '—',
    why: 'Returns HTTP 403 to automated requests, and its focus is listed-company financial statements rather than government bond pricing. Neither permitted nor particularly relevant to what we compute.',
  },
  {
    name: 'Bloomberg',
    url: 'https://www.bloomberg.com/',
    status: 'declined',
    used: '—',
    why: 'Blocks automated access and licenses its market data commercially at terminal prices. Excellent journalism, entirely unavailable to a free app — and republishing it would be straightforwardly unlawful.',
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
                    {/* A source we take nothing from gets no outbound link. */}
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-display font-semibold text-ink">
                        {s.name}
                      </a>
                    ) : (
                      <span className="font-display font-semibold text-ink">{s.name}</span>
                    )}
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

      <ArchiveCoverage />

      <p>
        The archive is downloadable as{' '}
        <a href="/data/auction-results.json">JSON</a> or <ArchiveDownload /> — the same file the app
        itself reads, gaps and all. The CSV names the date column{' '}
        <code className="num">valueDate</code>, because that is what it holds. If you want it for
        research, journalism or a product of your own, take it; attribution
        to CBK as the underlying source is the only thing we would ask. If you need it filled in,
        documented and kept current, that is work, and{' '}
        <a href="/support/">we can talk about it</a>.
      </p>

      <h2>Attribution</h2>
      <p>
        World Bank Open Data is used under{' '}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY 4.0 <ExternalLink size={11} className="inline" />
        </a>
        . CBK, KNBS and National Treasury materials remain the property of their publishers and are
        used for information with attribution. No Nairobi Securities Exchange data is used,
        stored or republished anywhere in this application.
      </p>
    </Prose>
  );
}
