import bondsData from '../../../public/data/bonds.json';
import auctionsData from '../../../public/data/auction-results.json';
import cbrData from '../../../public/data/cbr-history.json';
import { computeBondInvestment } from '@/lib/financial-engine';
import type { Bond, AuctionPrint, RateDecision } from '@/types/bond';

/**
 * Evidence, computed from the data this app actually ships.
 *
 * Every figure below is derived at build time from the same JSON the
 * calculators read, so none of it can drift out of step with the product or
 * quietly become untrue as the daily refresh moves the numbers. Nothing here is
 * a claim from elsewhere that a reader would have to take on trust — it is a
 * description of what is in the app, checkable by using it.
 *
 * That is the point of putting it on the landing page. A first-time visitor has
 * no reason to believe a stranger's yield figures; showing the depth of the
 * underlying record is the honest way to earn the second click.
 */

const BONDS = bondsData as unknown as Bond[];
const PRINTS = auctionsData as unknown as AuctionPrint[];
const CBR = cbrData as unknown as RateDecision[];

function stats() {
  const taxed = BONDS.filter((b) => !b.taxExempt);
  const exempt = BONDS.filter((b) => b.taxExempt);

  const drags = taxed
    .map((b) => {
      const r = computeBondInvestment(b, 1_000_000, 100);
      return r.grossAnnualIncomeKES - r.netAnnualIncomeKES;
    })
    .sort((a, b) => a - b);
  const medianLost = drags.length ? drags[Math.floor(drags.length / 2)] : 0;

  const dates = PRINTS.map((p) => p.auctionDate).filter(Boolean).sort();
  const earliestYear = dates.length ? Number(dates[0].slice(0, 4)) : new Date().getFullYear();
  const yearsOfRecord = Math.max(1, new Date().getFullYear() - earliestYear);

  const rates = CBR.map((d) => d.rate).filter((r) => Number.isFinite(r));

  return {
    bonds: BONDS.length,
    exempt: exempt.length,
    prints: PRINTS.length,
    issues: new Set(PRINTS.map((p) => p.issueCode)).size,
    earliestYear,
    yearsOfRecord,
    medianLost: Math.round(medianLost),
    cbrLow: Math.min(...rates),
    cbrHigh: Math.max(...rates),
    cbrDecisions: rates.length,
  };
}

const kes = (n: number) => `KES ${n.toLocaleString('en-KE')}`;

export default function EvidenceStrip() {
  const s = stats();

  const facts = [
    {
      figure: kes(s.medianLost),
      unit: 'a year, per KES 1M',
      claim: 'is what withholding tax quietly removes',
      detail: `The typical taxable bond on issue today loses this much of its annual interest before it reaches you. Every figure in this app is shown after that deduction — because it is the only one you can spend.`,
    },
    {
      figure: `${s.exempt} of ${s.bonds}`,
      unit: 'bonds pay tax-free',
      claim: 'and they are not always the ones quoting the highest rate',
      detail: `Infrastructure bonds are exempt from withholding tax, so a lower headline rate can beat a higher one once the deduction lands. We rank on the after-tax number so the comparison is honest.`,
    },
    {
      figure: s.prints.toLocaleString('en-KE'),
      unit: `auction results, ${s.earliestYear}–today`,
      claim: `across ${s.issues} government issues`,
      detail: `Read from the Central Bank's own published result sheets going back ${s.yearsOfRecord} years, so you can see what a bond has actually cleared at before — not just what is being asked for it today.`,
    },
    {
      figure: `${s.cbrLow}–${s.cbrHigh}%`,
      unit: 'Central Bank Rate range',
      claim: `over ${s.cbrDecisions} published decisions`,
      detail: `Rates move, and a plan built on today's alone is a bet. Long-term projections here are marked down by the fall this record shows is possible, and state both ends plainly.`,
    },
  ];

  return (
    <section aria-labelledby="evidence-heading">
      <h2 id="evidence-heading" className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
        The numbers behind the numbers
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
        You have no reason to trust a stranger&apos;s yield figures. So here is what sits underneath
        them — all of it drawn from public Central Bank data, and all of it checkable.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
        {facts.map((f) => (
          <div key={f.unit} className="card flex flex-col p-5">
            <p className="num text-2xl font-bold leading-tight text-gold-700 md:text-3xl">
              {f.figure}
            </p>
            <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
              {f.unit}
            </p>
            <p className="mt-2 text-sm font-medium text-ink">{f.claim}</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{f.detail}</p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
        Figures recomputed from the Central Bank of Kenya auction record and MPC decisions each time
        this page is published. Tax impact is the median across taxable bonds currently on issue, on
        KES 1,000,000 of face value at par. Analytics for education, not investment advice.
      </p>
    </section>
  );
}
