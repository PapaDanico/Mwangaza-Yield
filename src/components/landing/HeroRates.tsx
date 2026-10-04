import Link from 'next/link';
import RATES from '../../../public/data/rates.json';

const fmt = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' });

/**
 * Today's T-bill rates, above the fold on the home page.
 *
 * Measured 4 Oct 2026 at 390px: a first-time visitor read ~90 words and two
 * buttons before seeing a single rate, while every comparable Kenyan tool
 * benchmarked that day leads with the numbers. These are the after-tax
 * figures from the published feed (rates.json), so they cannot disagree with
 * the CSV, JiPange or the dashboard. Built at compile time: server-rendered,
 * no layout shift, and refreshed by the deploy that follows every auction
 * entry.
 */
export default function HeroRates() {
  const bills = RATES.tbills.filter((t) => typeof t.netEAY === 'number');
  if (bills.length === 0) return null;
  const date = bills[0].auctionDate;
  return (
    <Link
      href="/tbills/"
      className="card-link mt-6 block rounded-2xl border border-sand-300 bg-sand-50/80 p-4 shadow-card"
      aria-label="Treasury bill rates after tax from the latest CBK auction; open the T-bill page"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-faint">
        T-bills, after tax · CBK auction {fmt(date)}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {bills.map((t) => (
          <div key={t.tenorDays}>
            <p className="num text-2xl font-bold text-ink">{t.netEAY.toFixed(2)}%</p>
            <p className="text-xs text-ink-muted">{t.tenorDays}-day</p>
            <p className="num text-[11px] text-ink-faint">CBK rate {t.quotedDiscountRate.toFixed(2)}%</p>
          </div>
        ))}
      </div>
    </Link>
  );
}
