'use client';

import { useMemo, useState } from 'react';
import { Flame, GraduationCap, CalendarHeart, ShieldCheck, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useBondStore } from '@/stores/bondStore';
import {
  GOALS, planFire, planSchoolFees, planPassiveIncome, planPreservation, type GoalKey,
} from '@/lib/goals';
import { formatKES, formatPct } from '@/lib/financial-engine';
import { cn, formatCompactKES } from '@/lib/utils';

const ICONS: Record<GoalKey, typeof Flame> = {
  fire: Flame,
  'school-fees': GraduationCap,
  'passive-income': CalendarHeart,
  'capital-preservation': ShieldCheck,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const inputCls =
  'w-full rounded-xl border border-sand-400 bg-sand-50 px-3 py-2.5 text-sm text-ink outline-none focus:border-gold-500';

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-ink-soft">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-sand-300 p-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className={cn('num mt-1 text-lg font-bold', accent ?? 'text-ink')}>{value}</p>
    </div>
  );
}

export default function GoalsPage() {
  const bonds = useBondStore((s) => s.bonds);
  const secondary = useBondStore((s) => s.secondary);
  const tbills = useBondStore((s) => s.tbills);
  const [goal, setGoal] = useState<GoalKey>('fire');

  // FIRE
  const [targetIncome, setTargetIncome] = useState(1_200_000);
  const [capital, setCapital] = useState(2_000_000);
  const [monthly, setMonthly] = useState(50_000);
  // School fees
  const [feeCapital, setFeeCapital] = useState(3_000_000);
  const [firstFeeYear, setFirstFeeYear] = useState(new Date().getFullYear() + 6);
  const [yearsOfFees, setYearsOfFees] = useState(4);
  const [annualFee, setAnnualFee] = useState(400_000);
  // Income / preservation
  const [incomeCapital, setIncomeCapital] = useState(3_000_000);
  const [parkCapital, setParkCapital] = useState(500_000);

  const fire = useMemo(
    () => planFire(bonds, secondary, targetIncome, capital, monthly),
    [bonds, secondary, targetIncome, capital, monthly]
  );
  const fees = useMemo(
    () => planSchoolFees(bonds, secondary, feeCapital, firstFeeYear, yearsOfFees, annualFee),
    [bonds, secondary, feeCapital, firstFeeYear, yearsOfFees, annualFee]
  );
  const income = useMemo(
    () => planPassiveIncome(bonds, secondary, incomeCapital, 3),
    [bonds, secondary, incomeCapital]
  );
  const park = useMemo(() => planPreservation(tbills, parkCapital), [tbills, parkCapital]);

  if (!bonds.length) return <div className="card h-64 animate-pulse" />;

  const def = GOALS.find((g) => g.key === goal)!;
  const maxMonthly = Math.max(...income.monthlyIncomeKES, 1);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink">Plan by objective</h1>
        <p className="text-sm text-ink-muted">
          Start from what the money is for. We&apos;ll shape the bonds around it.
        </p>
      </div>

      {/* Mobile: a single control. The four cards are mode selection, not
          comparison, and stacked they push every input below the fold. */}
      <div className="sm:hidden">
        <label htmlFor="goal-select" className="mb-1 block text-sm font-medium text-ink-soft">
          What is the money for?
        </label>
        <select
          id="goal-select"
          value={goal}
          onChange={(e) => setGoal(e.target.value as GoalKey)}
          className={inputCls}
        >
          {GOALS.map((g) => (
            <option key={g.key} value={g.key}>
              {g.title} — {g.tagline.toLowerCase()}
            </option>
          ))}
        </select>
      </div>

      {/* Tablet and up: cards, where they cost nothing and read faster. */}
      <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-4">
        {GOALS.map((g) => {
          const Icon = ICONS[g.key];
          const active = g.key === goal;
          return (
            <button
              key={g.key}
              onClick={() => setGoal(g.key)}
              className={cn(
                'card text-left transition',
                active ? 'border-gold-500 ring-1 ring-gold-500' : 'hover:border-gold-500'
              )}
            >
              <Icon size={20} className={active ? 'text-gold-700' : 'text-ink-muted'} />
              <p className="mt-2 font-display text-sm font-semibold text-ink">{g.title}</p>
              <p className="mt-0.5 text-xs text-ink-faint">{g.tagline}</p>
            </button>
          );
        })}
      </div>

      <p className="text-sm text-ink-muted">{def.description}</p>

      {/* ------------------------------------------------------------ FIRE */}
      {goal === 'fire' && (
        <div className="grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Annual income you want (today's money)">
              <input type="number" step={50_000} value={targetIncome}
                onChange={(e) => setTargetIncome(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
            <Field label="Capital you have now">
              <input type="number" step={100_000} value={capital}
                onChange={(e) => setCapital(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
            <Field label="Monthly contribution" hint="Reinvested at the same net yield each year.">
              <input type="number" step={10_000} value={monthly}
                onChange={(e) => setMonthly(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
          </div>

          <div className="space-y-4">
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                Capital required
              </p>
              <p className="num mt-1 text-4xl font-bold text-gold-700">
                {formatCompactKES(fire.requiredCapitalKES)}
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                to draw {formatKES(fire.targetAnnualIncomeKES)} a year at{' '}
                <span className="num font-semibold text-ink">{formatPct(fire.bestNetYield)}</span> net
                {fire.bestBond && ` (${fire.bestBond.issueCode}${fire.bestBond.taxExempt ? ', tax-free' : ''})`}
              </p>

              <div className="mt-4">
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>Funded today</span>
                  <span className="num">{formatPct(Math.min(1, fire.coverageRatio) * 100, 1)}</span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-sand-200">
                  <div className="h-full rounded-full bg-mint-600"
                    style={{ width: `${Math.min(100, fire.coverageRatio * 100)}%` }} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Stat label="Income from capital now" value={formatCompactKES(fire.incomeFromCurrentKES)} accent="text-mint-700" />
              <Stat label="Still to raise" value={formatCompactKES(fire.shortfallKES)} />
              <Stat
                label="Years to target"
                value={fire.yearsToTarget === null ? '—' : fire.yearsToTarget === 0 ? 'Funded' : `${fire.yearsToTarget}`}
                accent="text-gold-700"
              />
            </div>

            <p className="text-[11px] leading-relaxed text-ink-faint">
              Assumes today&apos;s best net yield persists and every coupon is reinvested — bond
              rates reset at each auction, so treat this as a bearing, not a forecast. Inflation is
              not modelled; the target is stated in today&apos;s shillings.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------ School fees */}
      {goal === 'school-fees' && (
        <div className="grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Capital to invest now">
              <input type="number" step={100_000} value={feeCapital}
                onChange={(e) => setFeeCapital(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
            <Field label="First year fees are due">
              <input type="number" value={firstFeeYear}
                onChange={(e) => setFirstFeeYear(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
            <Field label="Years of fees">
              <input type="number" min={1} max={8} value={yearsOfFees}
                onChange={(e) => setYearsOfFees(Number(e.target.value) || 1)} className={`num ${inputCls}`} />
            </Field>
            <Field label="Fees per year">
              <input type="number" step={50_000} value={annualFee}
                onChange={(e) => setAnnualFee(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Total fees" value={formatCompactKES(fees.totalFeesKES)} />
              <Stat label="Covered by plan" value={formatCompactKES(fees.totalCoveredKES)} accent="text-mint-700" />
              <Stat
                label="Status"
                value={fees.fullyFunded ? 'Funded' : 'Gap'}
                accent={fees.fullyFunded ? 'text-mint-700' : 'text-gold-700'}
              />
            </div>

            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                    <th className="px-4 py-3">Year</th>
                    <th className="px-4 py-3 text-right">Fees due</th>
                    <th className="px-4 py-3 text-right">Principal lands</th>
                    <th className="px-4 py-3 text-right">Coupons</th>
                    <th className="px-4 py-3 text-right">Shortfall</th>
                  </tr>
                </thead>
                <tbody>
                  {fees.years.map((y) => (
                    <tr key={y.year} className="border-b border-sand-300/60 last:border-0">
                      <td className="num px-4 py-3 font-medium text-ink">{y.year}</td>
                      <td className="num px-4 py-3 text-right text-ink">{formatKES(y.feeKES)}</td>
                      <td className="num px-4 py-3 text-right text-mint-700">
                        {y.principalMaturingKES > 0 ? formatKES(y.principalMaturingKES) : '—'}
                      </td>
                      <td className="num px-4 py-3 text-right text-gold-700">{formatKES(y.couponsKES)}</td>
                      <td className={cn('num px-4 py-3 text-right', y.shortfallKES > 0 ? 'text-red-600' : 'text-ink-faint')}>
                        {y.shortfallKES > 0 ? formatKES(y.shortfallKES) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] leading-relaxed text-ink-faint">
              Maturities are matched to fee years so principal returns near the invoice rather than
              forcing a sale at whatever price the market offers. Where the market has no bond
              maturing in a fee year, coupons and neighbouring maturities carry the load — see the{' '}
              <Link href="/ladder/" className="text-gold-700 underline-offset-2 hover:underline">Ladder Builder</Link>{' '}
              for the underlying rungs.
            </p>
          </div>
        </div>
      )}

      {/* --------------------------------------------------- Passive income */}
      {goal === 'passive-income' && (
        <div className="space-y-4">
          <div className="grid gap-5 lg:grid-cols-[1fr,1.3fr]">
            <div className="card h-fit space-y-4">
              <Field label="Capital to invest" hint="Split across up to three bonds with complementary coupon months.">
                <input type="number" step={100_000} value={incomeCapital}
                  onChange={(e) => setIncomeCapital(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Average monthly" value={formatCompactKES(income.averageMonthlyKES)} accent="text-mint-700" />
                <Stat label="Months paid" value={`${income.monthsPaid} of 12`} accent="text-gold-700" />
              </div>
            </div>

            <div className="card">
              <h2 className="mb-1 font-semibold text-ink">Net income by month</h2>
              <p className="mb-4 text-xs text-ink-faint">
                {formatKES(income.totalNetAnnualKES)} a year, after withholding tax
              </p>
              <div className="flex items-end gap-1.5">
                {income.monthlyIncomeKES.map((v, i) => (
                  <div key={i} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-24 w-full items-end rounded-lg bg-sand-200 p-1">
                      <div className="w-full rounded bg-gold-500"
                        style={{ height: `${(v / maxMonthly) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                        title={formatKES(v)} />
                    </div>
                    <span className="text-[10px] text-ink-muted">{MONTHS[i]}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-sand-300 text-left text-xs uppercase tracking-wide text-ink-muted">
                  <th className="px-4 py-3">Bond</th>
                  <th className="px-4 py-3 text-right">Face value</th>
                  <th className="px-4 py-3 text-right">Net coupon</th>
                  <th className="px-4 py-3 text-right">Pays in</th>
                </tr>
              </thead>
              <tbody>
                {income.holdings.map((h) => (
                  <tr key={h.bond.isin} className="border-b border-sand-300/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-ink">
                      {h.bond.issueCode}
                      {h.bond.taxExempt && (
                        <span className="ml-2 rounded-full bg-mint-500/15 px-2 py-0.5 text-[10px] font-semibold text-mint-700">TAX-FREE</span>
                      )}
                    </td>
                    <td className="num px-4 py-3 text-right text-ink">{formatKES(h.faceValueKES)}</td>
                    <td className="num px-4 py-3 text-right text-mint-700">{formatKES(h.netCouponKES)}</td>
                    <td className="num px-4 py-3 text-right text-ink-soft">
                      {h.months.map((m) => MONTHS[m]).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] leading-relaxed text-ink-faint">
            Bonds are chosen to add new payout months first and yield second — six paying months
            beats a marginally higher coupon arriving twice a year when the money is meant to live
            on. Kenyan coupons are semi-annual, so twelve paying months needs six complementary
            issues.
          </p>
        </div>
      )}

      {/* -------------------------------------------- Capital preservation */}
      {goal === 'capital-preservation' && (
        <div className="grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Amount to park" hint="Treasury bill minimum is KES 100,000.">
              <input type="number" step={50_000} value={parkCapital}
                onChange={(e) => setParkCapital(Number(e.target.value) || 0)} className={`num ${inputCls}`} />
            </Field>
          </div>
          <div className="space-y-4">
            {park ? (
              <>
                <div className="card">
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
                    {park.tenorDays}-day Treasury bill
                  </p>
                  <p className="num mt-1 text-4xl font-bold text-gold-700">{formatPct(park.netEAY)}</p>
                  <p className="mt-1 text-sm text-ink-muted">
                    net effective yield · money back in {park.tenorDays} days
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Stat label="You pay" value={formatCompactKES(park.costKES)} />
                  <Stat label="Net interest" value={formatCompactKES(park.netInterestKES)} accent="text-mint-700" />
                  <Stat label="You receive" value={formatCompactKES(park.netProceedsKES)} accent="text-gold-700" />
                </div>
                <Link href="/tbills/" className="card flex items-center gap-3 transition hover:border-gold-500">
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-semibold text-ink">Compare all tenors</p>
                    <p className="text-sm text-ink-muted">91, 182 and 364-day bills with rollover projections.</p>
                  </div>
                  <ArrowRight size={16} className="text-ink-faint" />
                </Link>
              </>
            ) : (
              <div className="card py-10 text-center text-sm text-ink-muted">
                Treasury bill rates are still loading.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
