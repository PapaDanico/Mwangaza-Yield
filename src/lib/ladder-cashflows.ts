/**
 * The ladder's cash flows as dated rows, and as a CSV that carries its own
 * assumptions.
 *
 * A spreadsheet leaves the page and loses the page's caveats, so the file
 * states them in a header of `#` comment lines: what price each rung rests on
 * (a par placeholder is named as one), the tax treatment, that amounts are net
 * of withholding tax, and that paid dates are the next business day after the
 * scheduled one. A figure copied into a family budget should still say what it
 * assumed.
 *
 * Rows are the same ones the calendar export uses (scheduled coupon dates
 * after `asOf`, moved to the real payment day), so the two cannot disagree.
 */
import type { LadderPlan } from './ladder';
import { getCouponDates } from './financial-engine';
import { paymentDay } from './holidays';

export interface CashFlowRow {
  scheduled: string;
  paid: string;
  /** Why the paid date differs from the scheduled one, or null. */
  shiftReason: string | null;
  issueCode: string;
  kind: 'coupon' | 'maturity';
  /** Net coupon, after withholding tax. */
  couponNetKES: number;
  principalKES: number;
  totalKES: number;
}

export function ladderCashFlowRows(plan: LadderPlan, asOf: Date = new Date()): CashFlowRow[] {
  const rows: CashFlowRow[] = [];
  for (const r of plan.rungs) {
    const dates = getCouponDates(new Date(r.bond.issueDate), new Date(r.bond.maturityDate), r.bond.couponFrequencyPerYear || 2)
      .filter((d) => d > asOf);
    for (const d of dates) {
      const iso = d.toISOString().slice(0, 10);
      const maturity = iso === r.bond.maturityDate;
      const pay = paymentDay(iso);
      const coupon = r.result.netCouponPerPeriodKES;
      const principal = maturity ? r.faceValueKES : 0;
      rows.push({
        scheduled: iso, paid: pay.paid, shiftReason: pay.reason, issueCode: r.bond.issueCode,
        kind: maturity ? 'maturity' : 'coupon',
        couponNetKES: coupon, principalKES: principal, totalKES: coupon + principal,
      });
    }
  }
  return rows.sort((a, b) => a.paid.localeCompare(b.paid) || a.issueCode.localeCompare(b.issueCode));
}

const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const n = (v: number) => v.toFixed(2);

export function ladderCsv(plan: LadderPlan, generatedOn: string, asOf: Date = new Date()): string {
  const rows = ladderCashFlowRows(plan, asOf);
  const head = [
    '# Mwangaza Yield - ladder cash flows',
    `# Generated ${generatedOn}. A plan, not an offer; confirm prices with your broker or DhowCSD.`,
    '# Amounts are in Ksh and NET of withholding tax (15% on bonds under 10 years, 10% at 10 years or more, 0% on infrastructure bonds).',
    '# Paid is the next business day after Scheduled when the scheduled day is a weekend or public holiday.',
    ...plan.rungs.map((r) => {
      const src = r.priceInfo.source === 'par' ? 'par placeholder (no price held)' : r.priceInfo.source === 'user' ? 'price entered by you' : 'last traded price';
      return `# ${r.bond.issueCode}: face ${r.faceValueKES}, bought at ${r.price.toFixed(2)} per 100 (${src}), matures ${r.bond.maturityDate}`;
    }),
    ...(plan.priceCoverage && plan.rungs.some((r) => r.priceInfo.source === 'par')
      ? ['# WARNING: at least one rung is priced at par as a placeholder, so cost and yields are not market figures.']
      : []),
  ];
  const cols = 'paid,scheduled,issue_code,kind,coupon_net_ksh,principal_ksh,total_ksh,date_shift_reason';
  const body = rows.map((r) => [r.paid, r.scheduled, q(r.issueCode), r.kind, n(r.couponNetKES), n(r.principalKES), n(r.totalKES), q(r.shiftReason ?? '')].join(','));
  return [...head, cols, ...body].join('\n') + '\n';
}
