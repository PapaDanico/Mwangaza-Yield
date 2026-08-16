import type { Metadata } from 'next';
import { CheckCircle2, MinusCircle, XCircle, ExternalLink } from 'lucide-react';
import Prose from '@/components/shared/Prose';
import { LICENCES, KNOWN_EXPOSURES } from '@/lib/licences';
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
    why: 'KNBS compiles the index; we take the number from CBK\u2019s own release, and the reason is specific rather than a matter of convenience. knbs.or.ke answers, but its TLS certificate chain does not verify \u2014 it serves no intermediate certificate, so a browser quietly fetches the missing link itself while any ordinary HTTP client refuses. We do not disable certificate verification to collect financial data, so we do not collect it from there. That is the publisher\u2019s to fix and we re-check it on every probe run rather than assuming it is permanent; it was still failing on 9 August 2026, on all six KNBS addresses we try, from a clean server with unrestricted internet access. Our data file records the substitution against every reading, so the provenance is never guessed at.',
  },
  {
    name: 'World Bank Open Data',
    url: 'https://data.worldbank.org/country/kenya',
    status: 'live',
    used: 'Seven figures: GDP growth, reserves (import cover), exports as a share of GDP, the current account balance, interest as a share of government revenue, external debt to GNI, and debt service as a share of exports.',
    why: 'Free, keyless, versioned JSON API under CC BY 4.0 — the only major source on our list we may lawfully redistribute. We ask it for eight indicators and it answers on seven. The eighth, general government debt as a share of GDP, returns no observation for Kenya at all, so we show no debt-to-GDP figure — that is the source declining to answer, not our fetch failing, and every row we do publish carries a fetch stamp so the two can be told apart. We checked rather than assumed: the code answers with sixty-six rows and a value in none of them. Three of the seven are debt-burden measures, and they are the World Bank’s own compilation rather than the Treasury’s primary record — each carries the reference year it was compiled for, usually one to three years behind today. What the World Bank withholds is the ratio specifically, not the debt: it does serve Kenya’s external debt stock in dollars. The headline debt-to-GDP figure Kenyan coverage quotes comes from the IMF, and we do not republish it, because the IMF ships outturns and forecasts to 2031 in one undifferentiated series and two copies of it disagree by a point and a half on the same year. A number we cannot label as measured or projected is not one we will put beside measurements.',
  },
  {
    name: 'National Treasury',
    url: 'https://www.treasury.go.ke/',
    status: 'reference',
    used: 'Not yet read by anything we run — linked so you can go to the primary record',
    why: 'This entry used to claim we took public debt figures from here. We did not, and the debt data we show comes from the World Bank. We probed the site directly: its Public Debt Management pages are reachable, but the debt documents they link — the yield curve and the outstanding-bonds schedule — both return 404 while the site is mid-migration. There is nothing machine-readable to read yet, so we read nothing and say so.',
  },
  {
    name: 'Capital Markets Authority',
    url: 'https://www.cma.or.ke/',
    status: 'reference',
    used: 'Read from the bulletins directly, not scraped. Its collective-investment figures are the authoritative count of what Kenyan funds hold; its bond-turnover tables are attributed to the Exchange and are therefore not used.',
    why: 'CMA regulates the funds most Kenyans actually hold. Its Quarterly Statistical Bulletin — issues 64/2025 through 67/2026, the last covering the quarter ended June 2026 — puts collective-investment assets at Ksh 851.7bn as at March 2026, up 13% from Ksh 756.3bn in December, with 44.0% of that (Ksh 374.6bn) held in government securities. Note the lag: the June bulletin reports March CIS data, so this is a quarter behind by construction rather than by neglect. WHAT CMA DOES NOT PUBLISH is a per-fund yield. Both the bulletins and the Q4 FY2025/26 Soundness Report were read end to end; they carry assets, asset-class splits and regulatory commentary, and no table of fund returns anywhere. That matters because two widely-quoted third parties, searched minutes apart, attributed average money-market yields of 9.1% and of 14-18% to this report. Neither figure is in it. A fund yield comes from that fund\u2019s own fact sheet, and anyone citing CMA for one is citing a document they have not opened. THE BOND TURNOVER QUESTION IS SETTLED, AND CMA SETTLED IT. Its secondary-market tables — Ksh 1.703tn traded in the first half of 2026, Ksh 621.83bn in the June quarter — are printed under the attribution \u201cSource: NSE/CMA\u201d. Across that bulletin 31 tables carry the Exchange in their source line and five are CMA alone. So the turnover figures are exchange-derived by the regulator\u2019s own account, and the entry below commits us to publishing nothing derived from the Exchange. We take the CIS figures, which are reported to CMA by fund managers and attributed to CMA alone, and we leave the turnover where it is. The distinction is not ours to argue: it is written in the source lines of the document.',
  },
  {
    name: 'SASRA — SACCO Societies Regulatory Authority',
    url: 'https://www.sasra.go.ke/',
    status: 'reference',
    used: 'The sector context behind every SACCO figure the sister product shows — dividend and deposit-interest ranges, and the status of the deposit guarantee',
    why: 'SACCOs hold more Kenyan savings than the funds and the bond market between them, and they are the one place a reader is most likely to be comparing against a Treasury bill. SASRA\u2019s supervision reports give the sector ranges we quote as ranges — interest on member deposits commonly 8-12%, dividends on share capital commonly 10-15% among stronger societies — rather than a single invented average. The most consequential thing we take from SASRA is not a number at all: the Deposit Guarantee Fund provided for under the Sacco Societies Act is legislated but NOT yet operational, so a SACCO deposit carries no live statutory guarantee. A reader weighing one against a government bill needs that, and cannot get it from a yield.',
  },
  {
    name: 'Kenya Revenue Authority',
    url: 'https://www.kra.go.ke/',
    status: 'reference',
    used: 'The tax treatment applied to every figure either product reports as net — PAYE bands, and withholding tax on interest',
    why: 'Tax is where a gross yield becomes a number somebody actually keeps, and it is the step most comparisons skip. Withholding tax on Treasury bills is 15%, on bonds 10% at ten years or longer and 15% below, and infrastructure bonds are exempt entirely — three different treatments that decide which instrument wins, and none of them visible in a quoted rate. We read the rates from the Income Tax Act rather than scraping the site: tax rules change by Finance Act on a published date, not continuously, so a hardcoded rate with a citation is more honest here than a scraper pretending to track something that does not move.',
  },
  {
    name: 'Retirement Benefits Authority',
    url: 'https://www.rba.go.ke/',
    status: 'reference',
    used: 'Linked, not read. Names the regulator for the pension and provident products the sister product lists.',
    why: 'A reader comparing a personal pension against a bond ladder is comparing two things under different regulators with different protections, and the product directory says which is which. We publish no RBA figures — scheme returns are not centrally published in a form we could read, and we would rather name the regulator and stop than estimate one.',
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
      updated="31 July 2026"
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
                      /* inline-flex + min-h-6: this is the card's own heading
                         link, a standalone target rather than a link inside a
                         sentence, and it measured 23px. */
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-6 items-center font-display font-semibold text-ink">
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

      <h2>Attribution, and what we are actually permitted to republish</h2>
      <p>
        &ldquo;It is government data, so it is public&rdquo; is <strong>not true in Kenya</strong>.
        There is no local equivalent of the American rule that puts government works in the public
        domain: the Copyright Act No. 12 of 2001 gives works made under a government commission
        fifty years of copyright, and the Statistics Act No. 4 of 2006 gives the Bureau a mandate
        to <em>publish</em>, which is not a grant of reuse rights to anyone else. So each source
        below was checked individually, and the sentence its own terms use is quoted rather than
        summarised.
      </p>
      <p>
        This table is generated from the same registry the build enforces. Every figure this site
        publishes must resolve to a source marked <em>permitted</em> here, or the build fails —
        so this page cannot drift from what the app actually does.
      </p>
      <div className="not-prose my-4 overflow-x-auto">
        {/* Fixed layout with explicit widths. Auto layout sized the middle
            column to the longest verdict string and crushed the quotes into a
            column too narrow to read, which defeats the point of quoting them
            rather than summarising. */}
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[24%]" />
            <col className="w-[58%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint">
              <th className="pb-1 pr-3 font-medium">Source</th>
              <th className="pb-1 pr-3 font-medium">May we republish?</th>
              <th className="pb-1 font-medium">On whose words</th>
            </tr>
          </thead>
          <tbody>
            {LICENCES.map((l) => (
              <tr key={l.id} className="border-t border-sand-200 align-top">
                <td className="py-1.5 pr-3 text-ink">{l.id}</td>
                <td className="py-1.5 pr-3">
                  <span
                    className={
                      l.verdict === 'permitted' ? 'text-mint-700' : 'text-ink-soft'
                    }
                  >
                    {l.verdict === 'permitted' ? `Yes — ${l.licence}` : 'No'}
                  </span>
                </td>
                <td className="py-1.5 text-ink-soft">
                  <span className="italic">&ldquo;{l.terms}&rdquo;</span>
                  {l.termsUrl && (
                    <>
                      {' '}
                      <a
                        href={l.termsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-1 whitespace-nowrap"
                      >
                        terms <ExternalLink size={11} className="inline" />
                      </a>
                    </>
                  )}
                  <span className="block text-[11px] text-ink-faint">
                    checked {l.checkedOn}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The uncomfortable one is KNBS, which originates Kenya&rsquo;s inflation figures and is the
        one source here that reserves its rights. Where we show a KNBS-originated number, we read
        and cite it from CBK, which republishes the same figures under a notice that does grant
        reproduction. That is not a workaround — it is citing the publisher whose terms we can
        actually satisfy.
      </p>
      {KNOWN_EXPOSURES.length > 0 && (
        <p>
          We are not there yet on everything. {KNOWN_EXPOSURES.length === 1 ? 'One figure' : `${KNOWN_EXPOSURES.length} figures`} on
          this site {KNOWN_EXPOSURES.length === 1 ? 'is' : 'are'} still cited to a source we cannot
          show permission for, and rather than quietly relabelling{' '}
          {KNOWN_EXPOSURES.length === 1 ? 'it' : 'them'} we are naming{' '}
          {KNOWN_EXPOSURES.length === 1 ? 'it' : 'them'} here:{' '}
          {KNOWN_EXPOSURES.map((e) => e.source).join('; ')}. Swapping the citation for one we have
          not verified would trade a licensing problem for a false attribution, which is worse. The
          build fails if{' '}
          {KNOWN_EXPOSURES.length === 1 ? 'it is' : 'they are'} still here after{' '}
          {KNOWN_EXPOSURES.map((e) => e.resolveBy).join(', ')}.
        </p>
      )}
      <p>
        No Nairobi Securities Exchange data is used, stored or republished anywhere in this
        application, and a test fails the build on any reference to it.
      </p>
    </Prose>
  );
}
