'use client';

import { useEffect, useMemo, useState } from 'react';
import { Flame, GraduationCap, CalendarHeart, ShieldCheck, ArrowRight, Save, Trash2, Check } from 'lucide-react';
import Link from 'next/link';
import { useBondStore } from '@/stores/bondStore';
import { usePriceStore } from '@/stores/priceStore';
import { CoverageNotice } from '@/components/shared/PriceProvenance';
import {
  GOALS, planFire, planSchoolFees, planPassiveIncome, planPreservation, type GoalKey,
} from '@/lib/goals';
import { formatKES, formatPct } from '@/lib/financial-engine';
import { cn, formatCompactKES, nonNegativeNumber } from '@/lib/utils';
import { usePlanStore } from '@/stores/planStore';
import { makePlan, suggestPlanName, type PlanInputs } from '@/lib/plans';
import DataState from '@/components/shared/DataState';
import GoalReport from '@/components/report/GoalReport';
import ReportActions from '@/components/report/ReportActions';
import BondPicker from '@/components/shared/BondPicker';
import WiderView from '@/components/shared/WiderView';
import GoalProgress from '@/components/shared/GoalProgress';
import { yearsLabel } from '@/lib/years-label';

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
      {/* The control lives INSIDE the label, which associates the two without
          needing an id on every caller. A screen reader announces "Capital you
          have now, edit" instead of "edit text, blank". */}
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-ink-soft">{label}</span>
        {children}
      </label>
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
  const cbrHistory = useBondStore((s) => s.cbrHistory);
  const userPrices = usePriceStore((s) => s.userPrices);
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
  /**
   * Bonds the reader has chosen, per objective.
   *
   * Kept apart on purpose: the bonds that suit a fee schedule are not the ones
   * that suit a monthly income, and a single shared list would carry a choice
   * across objectives that never meant it. Empty means "let the tool pick".
   */
  const [feeIsins, setFeeIsins] = useState<string[]>([]);
  const [incomeIsins, setIncomeIsins] = useState<string[]>([]);

  const { plans, load: loadPlans, save: savePlan, remove: removePlan } = usePlanStore();
  const [activePlanId, setActivePlanId] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  const currentInputs: PlanInputs = {
    targetIncome, capital, monthly,
    feeCapital, firstFeeYear, yearsOfFees, annualFee,
    incomeCapital, parkCapital,
  };

  function applyPlan(id: string) {
    setActivePlanId(id);
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    setGoal(p.goal);
    const i = p.inputs;
    if (i.targetIncome !== undefined) setTargetIncome(i.targetIncome);
    if (i.capital !== undefined) setCapital(i.capital);
    if (i.monthly !== undefined) setMonthly(i.monthly);
    if (i.feeCapital !== undefined) setFeeCapital(i.feeCapital);
    if (i.firstFeeYear !== undefined) setFirstFeeYear(i.firstFeeYear);
    if (i.yearsOfFees !== undefined) setYearsOfFees(i.yearsOfFees);
    if (i.annualFee !== undefined) setAnnualFee(i.annualFee);
    if (i.incomeCapital !== undefined) setIncomeCapital(i.incomeCapital);
    if (i.parkCapital !== undefined) setParkCapital(i.parkCapital);
  }

  /**
   * Naming a plan used to go through `window.prompt`, and that is why the Save
   * button did nothing for a large share of readers.
   *
   * `prompt` is a blocking dialog the platform is free to refuse, and mobile
   * platforms increasingly do: installed PWAs and Android WebViews suppress it,
   * and every desktop browser lets a reader tick "prevent this page from
   * creating additional dialogs" — after which the button is dead forever, with
   * no error and no way back. The handler read `null` and returned, so the
   * failure was perfectly silent: no plan, no message, no clue.
   *
   * The name is now an ordinary field in the page. It cannot be suppressed, it
   * works the same on every device, and it is visible before you commit rather
   * than sprung on you afterwards.
   */
  const [naming, setNaming] = useState(false);
  const [draftName, setDraftName] = useState('');

  function beginSave() {
    const existing = plans.find((p) => p.id === activePlanId);
    setDraftName(existing?.name ?? suggestPlanName(goal, currentInputs));
    setNaming(true);
  }

  async function handleSave(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    const existing = plans.find((p) => p.id === activePlanId);
    const now = new Date().toISOString();
    const plan = makePlan(goal, currentInputs, name, now, existing?.id);
    // Re-saving a plan must not wipe the readings recorded against it. makePlan
    // builds a fresh record, so anything the plan accumulated has to be carried
    // over explicitly.
    await savePlan(
      existing
        ? { ...plan, createdAt: existing.createdAt, checkpoints: existing.checkpoints }
        : plan
    );
    setActivePlanId(plan.id);
    setNaming(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2200);
  }

  const fire = useMemo(
    () => planFire(bonds, secondary, targetIncome, capital, monthly, cbrHistory, userPrices),
    [bonds, secondary, userPrices, targetIncome, capital, monthly, cbrHistory]
  );
  const fees = useMemo(
    () => planSchoolFees(bonds, secondary, feeCapital, firstFeeYear, yearsOfFees, annualFee, new Date(), userPrices, feeIsins),
    [bonds, secondary, userPrices, feeCapital, firstFeeYear, yearsOfFees, annualFee, feeIsins]
  );
  const income = useMemo(
    () => planPassiveIncome(bonds, secondary, incomeCapital, 3, userPrices, incomeIsins),
    [bonds, secondary, userPrices, incomeCapital, incomeIsins]
  );
  const park = useMemo(() => planPreservation(tbills, parkCapital), [tbills, parkCapital]);

  // Progress needs a saved plan: it is measured against the projection made on
  // a particular day with particular numbers, and unsaved inputs have no such
  // anchor. It also has to match the goal on screen, so switching goals does
  // not show one plan's readings under another's heading.
  const activePlan = plans.find((p) => p.id === activePlanId && p.goal === goal) ?? null;

  // Set after mount for the same reason the ladder does it: a build-time date
  // would differ from the client's and trip hydration.
  const [reportDate, setReportDate] = useState('');
  useEffect(
    () => setReportDate(new Date().toLocaleDateString('en-KE', { dateStyle: 'long' })),
    []
  );

  if (!bonds.length) return <DataState />;

  const def = GOALS.find((g) => g.key === goal)!;
  /** Every bond a reader could still buy, soonest maturity first. */
  const selectableBonds = bonds
    .filter((b) => new Date(b.maturityDate) > new Date())
    .sort((a, b) => a.maturityDate.localeCompare(b.maturityDate));
  const maxMonthly = Math.max(...income.monthlyIncomeKES, 1);

  return (
    <div className="space-y-5">
      <GoalReport
        goal={def}
        generatedAt={reportDate}
        fire={goal === 'fire' ? fire : null}
        fees={goal === 'school-fees' ? fees : null}
        income={goal === 'passive-income' ? income : null}
        preservation={goal === 'capital-preservation' ? park : null}
      />

      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Plan by objective</h1>
          <p className="text-sm text-ink-muted">
            Start from what the money is for. We&apos;ll shape the bonds around it.
          </p>
        </div>
        {/* One wrap context, full width on a phone. The export buttons and the
            plan controls used to be two separately-wrapping groups side by
            side, which at 390px stepped down the screen in different
            directions. */}
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <ReportActions sheetId="goal-report-sheet" filename={`mwangaza-${goal}-plan`} />
          {/* Saved plans: unbounded list, one choice, no comparison — a dropdown. */}
          {plans.length > 0 && (
            <select
              value={activePlanId}
              onChange={(e) => applyPlan(e.target.value)}
              aria-label="Saved plans"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-sand-400 bg-sand-50 px-3 py-2 text-sm text-ink outline-none focus:border-gold-500 sm:max-w-[12rem] sm:flex-none"
            >
              <option value="">Saved plans…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
          {activePlanId && (
            <button
              onClick={() => { removePlan(activePlanId); setActivePlanId(''); }}
              aria-label="Delete this plan"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-sand-400 p-2 text-ink-faint transition hover:border-red-400 hover:text-red-500"
            >
              <Trash2 size={15} />
            </button>
          )}
          <button
            onClick={beginSave}
            className="flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-sand-50 transition hover:bg-ink-soft sm:flex-none"
          >
            {justSaved ? <Check size={15} /> : <Save size={15} />}
            {justSaved ? 'Saved' : activePlanId ? 'Update' : 'Save plan'}
          </button>
        </div>
      </div>

      {/* The name field that replaced window.prompt. In the page, not over it. */}
      {naming && (
        <div className="no-print card flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <label htmlFor="plan-name" className="mb-1 block text-sm font-medium text-ink-soft">
              Name this plan
            </label>
            <input
              id="plan-name"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave(draftName);
                if (e.key === 'Escape') setNaming(false);
              }}
              className={inputCls}
            />
          </div>
          <button
            onClick={() => handleSave(draftName)}
            disabled={!draftName.trim()}
            className="min-h-11 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-sand-50 transition hover:bg-ink-soft disabled:opacity-40"
          >
            {activePlanId ? 'Update' : 'Save'}
          </button>
          <button
            onClick={() => setNaming(false)}
            className="min-h-11 rounded-xl border border-sand-400 px-4 py-2 text-sm font-medium text-ink transition hover:bg-sand-200"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Mobile: a single control. The four cards are mode selection, not
          comparison, and stacked they push every input below the fold. */}
      <div className="no-print sm:hidden">
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
      <div className="no-print hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-4">
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

      <p className="no-print text-sm text-ink-muted">{def.description}</p>

      {/* ------------------------------------------------------------ FIRE */}
      {goal === 'fire' && (
        <div className="no-print grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Annual income you want (today's money)">
              <input type="number" step={50_000} value={targetIncome}
                onChange={(e) => setTargetIncome(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
            </Field>
            <Field label="Capital you have now">
              <input type="number" step={100_000} value={capital}
                onChange={(e) => setCapital(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
            </Field>
            <Field label="Monthly contribution" hint="Reinvested at the cautious planning yield, not the best rate on the board.">
              <input type="number" step={10_000} value={monthly}
                onChange={(e) => setMonthly(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
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
                <span className="num font-semibold text-ink">{formatPct(fire.planningNetYield)}</span> net
                {fire.ladderRungs > 1 && ` — a ${fire.ladderRungs}-bond ladder, priced for a fall in rates`}
              </p>
              {/* The capital target is a division by the ladder's yield, so a
                  ladder priced at par understates the number the reader has to
                  reach. That belongs next to the figure, not in a footnote. */}
              <div className="mt-3"><CoverageNotice coverage={fire.priceCoverage} /></div>
              {fire.requiredCapitalIfRatesHoldKES > 0
                && fire.requiredCapitalIfRatesHoldKES < fire.requiredCapitalKES && (
                <p className="mt-1 text-sm text-ink-muted">
                  If rates instead hold near today&apos;s{' '}
                  <span className="num">{formatPct(fire.currentLadderNetYield)}</span>, you would
                  need{' '}
                  <span className="num font-semibold text-mint-700">
                    {formatCompactKES(fire.requiredCapitalIfRatesHoldKES)}
                  </span>
                  .
                </p>
              )}

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
                // A range, not a point. Any single rate compounded for a decade
                // is a claim about the future rate environment, and the CBR has
                // run from 5.75% to 18% inside this app's own history. Written
                // low to high; the disclosure says in words which end to plan
                // on rather than leaving it to be read off the order.
                value={yearsLabel(fire.yearsToTarget, fire.yearsIfRatesHold)}
                accent="text-gold-700"
              />
            </div>

            <div className="rounded-xl border border-sand-300 bg-sand-200/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                What this assumes
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
                {fire.ladderRungs > 1 ? (
                  <>
                    The headline figures price a{' '}
                    <span className="num font-semibold">{fire.ladderRungs}-bond ladder</span> you
                    could actually build, rather than the single highest-yielding bond, which no
                    one can buy without limit.
                  </>
                ) : (
                  // The ladder came back empty and the yield fell back to a single
                  // bond. Claiming a diversified basis here would describe the
                  // opposite of what was used.
                  <>
                    Not enough bonds are currently listed to build a ladder, so these figures rest
                    on a single bond&apos;s yield. Treat them as indicative until the market has
                    more paper on issue.
                  </>
                )}{' '}
                {fire.downsidePp > 0 ? (
                  <>
                    That yield is then marked down{' '}
                    <span className="num font-semibold">{fire.downsidePp.toFixed(2)} points</span>{' '}
                    for reinvestment — the drop the Central Bank Rate has made within the published
                    record. Where a range is shown it runs from today&apos;s rates holding up to
                    that fall;{' '}
                    <span className="font-semibold">plan on the higher figure</span>.
                  </>
                ) : (
                  // No CBR history loaded, so no markdown was applied and the two
                  // scenarios collapsed into one. Saying "deliberately cautious"
                  // here would describe a haircut that is not in the numbers.
                  <>
                    Rate history is unavailable right now, so no allowance for falling reinvestment
                    rates has been applied. These figures assume today&apos;s rates hold, which is
                    the optimistic case — treat the timeline as a floor, not a plan.
                  </>
                )}
              </p>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                Bonds you already hold keep their coupon to maturity; it is what you buy NEXT that
                reprices, which is why a long plan is a rate bet as much as a savings one. Every
                coupon is assumed reinvested. Inflation is not modelled, so the target is in
                today&apos;s shillings — at 5% inflation, money buys about half as much in 14
                years. This is an estimate for planning, not advice or a forecast.
              </p>
            </div>
          </div>
        </div>
      )}

      {goal === 'fire' && activePlan && (
        <GoalProgress
          plan={activePlan}
          targetKES={fire.requiredCapitalKES}
          annualRatePct={fire.planningNetYield}
          startKES={activePlan.inputs.capital ?? 0}
          monthlyKES={activePlan.inputs.monthly ?? 0}
          onChange={savePlan}
        />
      )}

      {/* ------------------------------------------------------ School fees */}
      {goal === 'school-fees' && (
        <div className="no-print grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Capital to invest now">
              <input type="number" step={100_000} value={feeCapital}
                onChange={(e) => setFeeCapital(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
            </Field>
            <Field label="First year fees are due">
              <input type="number" value={firstFeeYear}
                onChange={(e) => setFirstFeeYear(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
            </Field>
            <Field label="Years of fees">
              <input type="number" min={1} max={8} value={yearsOfFees}
                onChange={(e) => setYearsOfFees(Number(e.target.value) || 1)} className={`num ${inputCls}`} />
            </Field>
            <Field label="Fees per year">
              <input type="number" step={50_000} value={annualFee}
                onChange={(e) => setAnnualFee(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
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

            <div className="card">
              <h3 className="mb-1 font-display text-sm font-semibold text-ink">
                The bonds funding these fees
              </h3>
              <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
                We pick for the best net yield in each maturity window. If you know the term the
                first invoice lands, or you already hold something, say so — capital re-splits
                evenly across whatever you choose.
              </p>
              <BondPicker
                selectable={selectableBonds}
                current={fees.ladder.rungs.map((r) => r.bond)}
                chosen={feeIsins}
                onChange={setFeeIsins}
                slotLabel="fee-bond"
              />
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

      {goal === 'school-fees' && activePlan && (
        // The fees themselves are the target: the pot has to cover them by the
        // time they fall due. Growth is the ladder's own blended net yield, and
        // there is no monthly contribution in this planner, so the projection
        // is the capital compounding alone.
        <GoalProgress
          plan={activePlan}
          targetKES={fees.totalFeesKES}
          annualRatePct={fees.ladder.blendedNetYTM}
          startKES={activePlan.inputs.feeCapital ?? 0}
          monthlyKES={0}
          onChange={savePlan}
        />
      )}

      {/* --------------------------------------------------- Passive income */}
      {goal === 'passive-income' && (
        <div className="no-print space-y-4">
          <div className="grid gap-5 lg:grid-cols-[1fr,1.3fr]">
            <div className="card h-fit space-y-4">
              <Field label="Capital to invest" hint="Split across up to three bonds with complementary coupon months.">
                <input type="number" step={100_000} value={incomeCapital}
                  onChange={(e) => setIncomeCapital(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
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

          <div className="card">
            <h3 className="mb-1 font-display text-sm font-semibold text-ink">
              The bonds paying this income
            </h3>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
              We pick for the widest spread of payout months. Swap any of them and the calendar
              above recomputes from your choice — including if that leaves a month empty, because
              seeing the real consequence beats being quietly corrected.
            </p>
            <BondPicker
              selectable={selectableBonds}
              current={income.holdings.map((h) => h.bond)}
              chosen={incomeIsins}
              onChange={setIncomeIsins}
              slotLabel="income-bond"
            />
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
        <div className="no-print grid gap-5 lg:grid-cols-[1fr,1.3fr]">
          <div className="card h-fit space-y-4">
            <Field label="Amount to park" hint="Treasury bill minimum is Ksh 100,000.">
              <input type="number" step={50_000} value={parkCapital}
                onChange={(e) => setParkCapital(nonNegativeNumber(e.target.value))} className={`num ${inputCls}`} />
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

      {/* Every plan on this page ends in a monthly contribution, and this app
          has no view at all on where that money comes from. Sending someone
          away to answer that is more useful than pretending the question does
          not exist. */}
      <div className="no-print mt-8">
        <WiderView
          wider={{
            question: 'Can you actually free up that monthly contribution?',
            answer:
              'This page works out what to buy and what it pays. It knows nothing about your budget, your loans or your emergency fund — and a plan to invest monthly is worth little if a 24% loan is running alongside it. JiPange has twenty-seven calculators for exactly that side of the question.',
            href: 'https://jipangefinance.org/',
            label: 'Open JiPange',
          }}
        />
      </div>
    </div>
  );
}
