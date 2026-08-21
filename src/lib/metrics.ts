/**
 * Shape the usage counters into something a person can read.
 *
 * WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT
 * ---------------------------------------------
 * `netlify/functions/track.mts` increments a counter per event per day. That
 * is the whole data model, and it was chosen so the store cannot leak what it
 * never held: there is no user identifier anywhere in the write path, no
 * session, no cookie, no address.
 *
 * The direct consequence — and the thing most likely to be misread — is that
 * these are EVENT COUNTS, NOT PEOPLE. One reader opening the dashboard ten
 * times is ten views, indistinguishable from ten readers opening it once. No
 * figure here can be described as "visitors" or "users" without inventing a
 * distinction the data does not contain, so nothing in this module produces a
 * number under those names, and `TRAFFIC_CAVEAT` is exported for the UI to
 * state it in plain words rather than leaving it implied.
 *
 * Two further limits worth carrying to the surface:
 *
 *   - Counts UNDER-report. track.mts does a read-modify-write on a blob, which
 *     is not atomic, so two beacons in the same instant lose one. Its own
 *     header says so. Treat every figure as a floor.
 *   - A day with no events has no blob at all. That is indistinguishable from
 *     a day when collection was broken — during the 19 Aug outage, for
 *     instance. `summarise` fills such days with zero so the series stays
 *     continuous, and reports `daysWithNoData` so the gap is visible rather
 *     than drawn as a confident flat line.
 *
 * WHY VIEWS AND ACTIONS ARE SEPARATED
 * -----------------------------------
 * The whitelist has two prefixes and they answer different questions. `view:`
 * says a page was opened. `act:` says somebody ran a calculation, tested a
 * bid, saved a price — they did the thing the page exists for. A total that
 * mixes them flatters the site, because views are cheap and actions are not.
 *
 * The ratio between them is reported as actions per hundred views and named
 * exactly that. It is deliberately NOT called a conversion rate: nothing here
 * tracks a single reader from view to action, so "conversion" would assert a
 * causal path through data that cannot see one.
 */

/** The raw payload from `GET /.netlify/functions/track?token=…`. */
export interface MetricsPayload {
  ok: boolean;
  days: Record<string, Record<string, number>>;
}

export type EventKind = 'view' | 'act';

export interface EventTotal {
  event: string;
  /** Human label, e.g. "Dashboard" or "Calculator run". */
  label: string;
  kind: EventKind;
  count: number;
  /** Share of its own kind's total, 0–100. Null when that total is zero. */
  sharePct: number | null;
}

export interface DailyPoint {
  date: string;
  views: number;
  actions: number;
  total: number;
  /** True when the day carried no blob at all — a gap, not a measured zero. */
  noData: boolean;
}

export interface MetricsSummary {
  totalEvents: number;
  views: number;
  actions: number;
  /** Actions per hundred views. Null when there are no views to divide by. */
  actionsPerHundredViews: number | null;
  firstDay: string | null;
  lastDay: string | null;
  daysCovered: number;
  daysWithNoData: number;
  byEvent: EventTotal[];
  daily: DailyPoint[];
}

/**
 * State this wherever the numbers are shown. It is exported rather than
 * written into the component so the caveat and the arithmetic cannot drift
 * apart — the same reason the licence terms live beside the licence.
 */
export const TRAFFIC_CAVEAT =
  'These are event counts, not people. One reader opening a page ten times ' +
  'is ten views. Nothing here identifies anyone, so no figure can be read as ' +
  'a visitor count. Counts are a floor, not an exact total: concurrent writes ' +
  'can lose one.';

export const kindOf = (event: string): EventKind => (event.startsWith('act:') ? 'act' : 'view');

/**
 * "view:yield-curve" -> "Yield curve"; "act:calculator-run" -> "Calculator run".
 *
 * Derived rather than table-driven on purpose: a lookup table would need
 * updating in lockstep with the whitelist in track.mts, and the whole reason
 * that whitelist is duplicated there is that the two are allowed to drift.
 * A derived label degrades into something readable instead of into a blank.
 */
export function labelFor(event: string): string {
  const body = event.includes(':') ? event.slice(event.indexOf(':') + 1) : event;
  const words = body.replace(/[-_]+/g, ' ').trim();
  if (!words) return event;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Every date from `from` to `to` inclusive, as YYYY-MM-DD. */
function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const cur = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(cur.getTime()) || Number.isNaN(end.getTime())) return out;
  // A guard rather than a while(true): a malformed pair must not spin.
  for (let i = 0; cur <= end && i < 3_650; i++) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function summarise(payload: MetricsPayload | null | undefined): MetricsSummary {
  const days = payload?.days ?? {};
  const dates = Object.keys(days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();

  const empty: MetricsSummary = {
    totalEvents: 0,
    views: 0,
    actions: 0,
    actionsPerHundredViews: null,
    firstDay: null,
    lastDay: null,
    daysCovered: 0,
    daysWithNoData: 0,
    byEvent: [],
    daily: [],
  };
  if (!dates.length) return empty;

  const totals = new Map<string, number>();
  for (const d of dates) {
    for (const [event, n] of Object.entries(days[d] ?? {})) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) continue;
      totals.set(event, (totals.get(event) ?? 0) + n);
    }
  }

  let views = 0;
  let actions = 0;
  for (const [event, n] of totals) {
    if (kindOf(event) === 'act') actions += n;
    else views += n;
  }

  const byEvent: EventTotal[] = [...totals.entries()]
    .map(([event, count]) => {
      const kind = kindOf(event);
      const kindTotal = kind === 'act' ? actions : views;
      return {
        event,
        label: labelFor(event),
        kind,
        count,
        sharePct: kindTotal > 0 ? (count / kindTotal) * 100 : null,
      };
    })
    .sort((a, b) => b.count - a.count || a.event.localeCompare(b.event));

  // The series spans first to last observed day so a gap in the middle is
  // drawn as a gap. Filling only the days present would silently close it.
  const firstDay = dates[0];
  const lastDay = dates[dates.length - 1];
  const present = new Set(dates);
  const daily: DailyPoint[] = dateRange(firstDay, lastDay).map((date) => {
    const row = days[date];
    let v = 0;
    let a = 0;
    for (const [event, n] of Object.entries(row ?? {})) {
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) continue;
      if (kindOf(event) === 'act') a += n;
      else v += n;
    }
    return { date, views: v, actions: a, total: v + a, noData: !present.has(date) };
  });

  return {
    totalEvents: views + actions,
    views,
    actions,
    actionsPerHundredViews: views > 0 ? (actions / views) * 100 : null,
    firstDay,
    lastDay,
    daysCovered: daily.length,
    daysWithNoData: daily.filter((d) => d.noData).length,
    byEvent,
    daily,
  };
}
