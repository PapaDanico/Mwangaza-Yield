/**
 * Alert rules: what a reader wants to be told about, and when.
 *
 * WHAT THIS CAN HONESTLY PROMISE
 * -------------------------------
 * There is no server. Nothing here wakes a phone up on its own — the browser
 * only runs this code when the app is open, or when the operating system
 * decides to run a periodic sync (which most browsers never do). So the
 * contract is: *the app tells you the moment you open it*, and additionally
 * raises a system notification if you granted permission and the app happened
 * to be running.
 *
 * That is deliberately less than "we will alert you". Promising a push we
 * cannot send would be the same defect as quoting a yield we cannot support.
 * When a sender exists, the same rules drive it unchanged — evaluation is a
 * pure function of (rules, world, now), so it runs identically in a browser
 * tab, a service worker, or a scheduled function.
 *
 * WHY EVENT IDS ARE STABLE
 * -------------------------
 * Every event's id is derived from the rule and the dated fact that triggered
 * it, never from the clock. Open the app three times on the same morning and
 * the coupon falling due on 17 August produces the same id all three times, so
 * the delivery log suppresses the repeats. Change the rule and the id changes
 * with it, because a reader who raises a threshold is asking to be told again.
 */
import type { AuctionSchedule, Bond, Holding, TBill } from '@/types/bond';
import { determineWHTRate, getCouponDates, formatKES } from './financial-engine';

export type AlertRuleKind = 'auction-window' | 'coupon-due' | 'maturity' | 'tbill-threshold';

export interface AlertRule {
  id: string;
  kind: AlertRuleKind;
  enabled: boolean;
  /** How many days ahead of the dated event to raise it. Ignored by threshold rules. */
  leadDays: number;
  /** `tbill-threshold` only. */
  tenorDays?: 91 | 182 | 364;
  /** `tbill-threshold` only: raise when the latest rate is at or above this, %. */
  thresholdPct?: number;
  createdAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  kind: AlertRuleKind;
  /** The date the thing happens — not the date we noticed it. */
  date: string;
  /** Days from `now` to `date`; 0 means today, negative never occurs. */
  daysAway: number;
  title: string;
  body: string;
  href: string;
}

export interface AlertWorld {
  auctions: AuctionSchedule[];
  bonds: Bond[];
  holdings: Holding[];
  tbills: TBill[];
}

const DAY = 86_400_000;

/** Whole days between two dates, counted on the UTC calendar so a timezone
 *  offset or a daylight-saving jump can never turn 1 day into 0 or 2. */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((b - a) / DAY);
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

function whenPhrase(days: number): string {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

export const DEFAULT_RULES: Omit<AlertRule, 'id' | 'createdAt'>[] = [
  { kind: 'auction-window', enabled: true, leadDays: 5 },
  { kind: 'coupon-due', enabled: true, leadDays: 7 },
  { kind: 'maturity', enabled: true, leadDays: 30 },
  { kind: 'tbill-threshold', enabled: false, leadDays: 0, tenorDays: 364, thresholdPct: 12 },
];

export const RULE_LABELS: Record<AlertRuleKind, { title: string; blurb: string }> = {
  'auction-window': {
    title: 'Auction windows',
    blurb: 'When a Treasury bond offer is about to close and you can still bid.',
  },
  'coupon-due': {
    title: 'Coupons on your holdings',
    blurb: 'When interest on a bond in your portfolio is due to be paid.',
  },
  maturity: {
    title: 'Bonds maturing',
    blurb: 'When your principal is coming back and needs somewhere to go.',
  },
  'tbill-threshold': {
    title: 'T-Bill rate threshold',
    blurb: 'When the latest weekly auction clears at or above a rate you choose.',
  },
};

/** Half a year's coupon on one holding, in shillings, gross and after WHT.
 *  `determineWHTRate` returns a FRACTION (0.1, not 10) — treating it as a
 *  percentage understated the tax by two orders of magnitude, turning a
 *  Ksh 8,000 deduction into Ksh 80. */
function couponAmounts(bond: Bond, holding: Holding) {
  const gross = (holding.faceValueKES * bond.couponRate) / 100 / bond.couponFrequencyPerYear;
  const wht = determineWHTRate(bond);
  return { gross, net: gross * (1 - wht), whtPct: wht * 100 };
}

function auctionEvents(rule: AlertRule, world: AlertWorld, now: Date): AlertEvent[] {
  const out: AlertEvent[] = [];
  for (const a of world.auctions) {
    if (a.status === 'settled' || a.status === 'closed') continue;
    const close = new Date(`${a.offerCloseDate}T00:00:00Z`);
    if (Number.isNaN(close.getTime())) continue;
    const away = daysBetween(now, close);
    if (away < 0 || away > rule.leadDays) continue;
    out.push({
      id: `${rule.id}|auction|${a.id}`,
      ruleId: rule.id,
      kind: 'auction-window',
      date: a.offerCloseDate,
      daysAway: away,
      title: `Bids close ${whenPhrase(away)}: ${a.issueCode}`,
      body: `${a.bondName}. CBK stops accepting bids on ${a.offerCloseDate}; settlement ${a.settlementDate}.`,
      href: '/auctions/',
    });
  }
  return out;
}

function holdingEvents(rule: AlertRule, world: AlertWorld, now: Date): AlertEvent[] {
  const out: AlertEvent[] = [];
  const byIsin = new Map(world.bonds.map((b) => [b.isin, b]));
  const byCode = new Map(world.bonds.map((b) => [b.issueCode, b]));

  for (const h of world.holdings) {
    // A holding whose bond has left the dataset cannot be scheduled. Silence is
    // right here: we would rather say nothing than date a coupon by guesswork.
    const bond = byIsin.get(h.isin) ?? byCode.get(h.issueCode);
    if (!bond) continue;
    const maturity = new Date(`${bond.maturityDate}T00:00:00Z`);
    if (Number.isNaN(maturity.getTime())) continue;

    if (rule.kind === 'maturity') {
      const away = daysBetween(now, maturity);
      if (away < 0 || away > rule.leadDays) continue;
      out.push({
        id: `${rule.id}|maturity|${h.id}`,
        ruleId: rule.id,
        kind: 'maturity',
        date: bond.maturityDate,
        daysAway: away,
        title: `${bond.issueCode} matures ${whenPhrase(away)}`,
        body: `${formatKES(h.faceValueKES)} of principal is redeemed on ${bond.maturityDate}. Decide where it goes before it lands.`,
        href: '/ladder/',
      });
      continue;
    }

    const dates = getCouponDates(
      new Date(`${bond.issueDate}T00:00:00Z`),
      maturity,
      bond.couponFrequencyPerYear
    );
    const { gross, net, whtPct } = couponAmounts(bond, h);
    for (const d of dates) {
      const away = daysBetween(now, d);
      if (away < 0 || away > rule.leadDays) continue;
      const day = iso(d);
      const final = day === bond.maturityDate.slice(0, 10);
      out.push({
        id: `${rule.id}|coupon|${h.id}|${day}`,
        ruleId: rule.id,
        kind: 'coupon-due',
        date: day,
        daysAway: away,
        title: `${final ? 'Final coupon' : 'Coupon'} ${whenPhrase(away)}: ${bond.issueCode}`,
        body:
          whtPct === 0
            ? `${formatKES(gross)} due on ${day}, tax-free.`
            : `${formatKES(gross)} due on ${day} — ${formatKES(net)} after ${whtPct}% withholding tax.`,
        href: '/portfolio/',
      });
    }
  }
  return out;
}

function tbillEvents(rule: AlertRule, world: AlertWorld, now: Date): AlertEvent[] {
  const tenor = rule.tenorDays;
  const threshold = rule.thresholdPct;
  if (!tenor || threshold == null) return [];

  // The latest auction for that tenor — the file carries one row per tenor per
  // week, and "latest" is the only one a threshold can be about.
  const rows = world.tbills.filter((t) => t.tenorDays === tenor);
  if (!rows.length) return [];
  const latest = rows.reduce((a, b) => (a.auctionDate >= b.auctionDate ? a : b));
  if (latest.discountRate < threshold) return [];

  // A rate is news for a fortnight at most; older than that and the reader has
  // opened the app after the fact, when the bill has already been allotted.
  const age = daysBetween(new Date(`${latest.auctionDate}T00:00:00Z`), now);
  if (age > 14) return [];

  return [
    {
      // The threshold is part of the identity: raise the bar and the same
      // auction crossing the new bar is a new thing to be told.
      id: `${rule.id}|tbill|${tenor}|${latest.auctionDate}|${threshold}`,
      ruleId: rule.id,
      kind: 'tbill-threshold',
      date: latest.auctionDate,
      daysAway: 0,
      title: `${tenor}-day T-Bill cleared at ${latest.discountRate.toFixed(3)}%`,
      body: `At or above your ${threshold}% mark. Next auction ${latest.nextAuctionDate}.`,
      href: '/tbills/',
    },
  ];
}

/**
 * Pure. Same inputs, same output, no clock of its own — `now` is passed in so
 * a test can stand anywhere in time and the future sender can stand in the
 * cloud.
 */
export function evaluateAlerts(rules: AlertRule[], world: AlertWorld, now: Date): AlertEvent[] {
  const out: AlertEvent[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.kind === 'auction-window') out.push(...auctionEvents(rule, world, now));
    else if (rule.kind === 'coupon-due' || rule.kind === 'maturity') {
      out.push(...holdingEvents(rule, world, now));
    } else if (rule.kind === 'tbill-threshold') out.push(...tbillEvents(rule, world, now));
  }
  // Soonest first; ties broken by id so the order never depends on rule order.
  return out.sort((a, b) => a.daysAway - b.daysAway || a.id.localeCompare(b.id));
}

/** Events not already in the delivery log. */
export function undelivered(events: AlertEvent[], delivered: Set<string>): AlertEvent[] {
  return events.filter((e) => !delivered.has(e.id));
}
