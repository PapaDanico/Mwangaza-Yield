import { ExternalLink } from 'lucide-react';
import {
  FISCAL_CONTEXT,
  fiscalIsStale,
} from '@/lib/fiscal-context';
import Explain from '@/components/shared/Explain';
import { formatKES } from '@/lib/financial-engine';

/**
 * What the issuer plans to sell — reinvestment-risk context for the ladder.
 *
 * One card, three dated facts, every one carrying the document it came from.
 * This is context, not a signal: it says what the borrower has stated and
 * done, and stops there. See lib/fiscal-context.ts for why the data is
 * hand-curated and what happens when it ages out.
 */
export default function IssuerIntent() {
  const { issuanceIntent: intent, nearTermSupply: supply, outturn, fy2026_27Outlook: fy, fy2025_26Outturn: done } = FISCAL_CONTEXT;

  if (fiscalIsStale()) {
    // An old strategy stated confidently is worse than an admitted gap. The
    // card degrades to the honest sentence rather than quietly quoting 2026
    // in 2028.
    return (
      <div className="no-print card border border-sand-300 text-sm text-ink-muted">
        <h2 className="font-semibold text-ink">What the issuer plans to sell</h2>
        <p className="mt-1">
          We do not have a current borrowing strategy on file — the last one we read was
          tabled in {new Date(intent.asOf).getFullYear()} and has aged out. The National
          Treasury publishes a new Medium-Term Debt Management Strategy each February via
          Parliament.
        </p>
      </div>
    );
  }

  // Format pre-scaled values, appending the unit suffix that gives them meaning.
  // The underlying values are stored in Bn (billions) and Tn (trillions) to
  // avoid 12-digit literals in the JSON. formatKES provides the "Ksh" prefix;
  // the suffix ("bn"/"tn") is the exponent that completes the number.
  const kesbn = (bn: number) => `${formatKES(Math.round(bn), 0)}bn`;
  const kestn = (tn: number) => `${formatKES(tn, 2)}tn`;

  return (
    <div className="no-print card border border-sand-300">
      <h2 className="font-semibold text-ink">What the issuer plans to sell</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        A ladder quietly bets that comparable bonds will still be on offer when each rung
        matures. The borrower has stated its intention: the current debt strategy sources{' '}
        <strong>{intent.grossDomesticBorrowingSharePct}% of borrowing domestically</strong>, runs
        the T-bill stock down from {intent.tbillShareOfDebtNowPct}% to{' '}
        {intent.tbillShareOfDebtTargetPct}% of debt by {intent.targetYear}, and lengthens
        average domestic maturity from {intent.domesticAtmNowYears} to{' '}
        {intent.domesticAtmTargetYears} years — <strong>more bonds, longer bonds</strong>, for
        the life of most ladders built here.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        For the current year, {fy.fiscalYear}, the budget targets{' '}
        <strong>{kesbn(fy.netDomesticBorrowingTargetKESBn)}</strong> of net domestic
        borrowing against a deficit of {fy.budgetDeficitPctGDP}% of GDP — up from the{' '}
        {kesbn(supply.netDomesticBorrowingKESBn)} the {supply.fiscalYear} supplementary
        settled on (itself raised from {kesbn(supply.revisedFromKESBn)}). Steady new supply
        of that size has historically favoured buyers at auction. The revenue side matters
        because it sets how much must be borrowed: KRA collected{' '}
        {kestn(fy.kraRevenueFY2526KESBn / 1000)} in {supply.fiscalYear}, up{' '}
        {fy.kraRevenueGrowthPct}% on the year before.
      </p>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">
        How last year actually closed: a deficit of{' '}
        <strong>{done.deficitInclGrantsPctGDP}% of GDP</strong> against a{' '}
        {done.deficitTargetPctGDP}% target, public debt of {kestn(done.publicDebtKESBn / 1000)}{' '}
        (up {done.publicDebtGrowthPct}%), and interest of {kesbn(done.interestPaidKESBn)} —{' '}
        {Math.round((done.interestPaidKESBn / done.ordinaryRevenueKESBn) * 100)} shillings of
        every 100 of ordinary revenue. Interest is paid before anything else, which is why the
        borrower keeps coming to auction.
      </p>
      <Explain label="Why believe it — and why you still might not">
        Stated intent is not a promise. In {outturn.fiscalYear} the same issuer sold{' '}
        {kestn(outturn.tbillsIssuedKESTn)} of T-bills against{' '}
        {kestn(outturn.bondsIssuedKESTn)} of bonds — nearly the reverse of the
        strategy&apos;s direction — so treat the plan as a leaning, not a schedule. Sources:{' '}
        {intent.source}; {supply.source}; {outturn.source}; {fy.source}; {done.source}.{' '}
        {/* Rendered only when we have a URL somebody has actually opened.
            This card linked http://www.parliament.go.ke/2026-2027-budget under
            "Read the documents" and that path answers 404 over both http and
            https — verified by the source probe, not assumed. A citation that
            names its document is honest; a link that promises the document is
            there and 404s is worse than no link. */}
        {intent.sourceUrl ? (
        <a
          href={intent.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-gold-700 underline underline-offset-2"
        >
          Read the documents <ExternalLink size={12} />
        </a>
        ) : null}
      </Explain>
      <p className="mt-2 text-[11px] text-ink-faint">
        Hand-curated from the tabled documents, {FISCAL_CONTEXT.curatedAt}. Context for
        education, not a recommendation.
      </p>
    </div>
  );
}
