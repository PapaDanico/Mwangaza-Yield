#!/usr/bin/env node
/**
 * Monthly tool usage, from a command.
 *
 *   METRICS_TOKEN=… node scripts/metrics-report.mjs          # every month in the 60-day window
 *   METRICS_TOKEN=… node scripts/metrics-report.mjs --json   # the same, machine-readable
 *
 * WHY. REVENUE.md §1's exit test: "passes when a monthly figure for tool usage
 * can be produced from a command, not a dashboard screenshot." The counters
 * have been readable since METRICS_TOKEN was set on 21 Aug, but only through
 * the /metrics page, one token-paste at a time. A fund manager, a sponsor and
 * a pricing decision all need the sentence "this tool was used N times last
 * month", and that sentence should come from something re-runnable.
 *
 * WHAT THE NUMBER IS. Each count is one tool use reported by a reader's
 * browser to netlify/functions/track.mts — counts of events, not of people.
 * The function keeps no identifiers by design, so "N uses", never "N users".
 *
 * Needs real network: mwangazayield.org is egress-blocked from Claude Code
 * sessions, so run it from any ordinary machine.
 */

const SITE = process.env.METRICS_SITE ?? 'https://mwangazayield.org';

/** { 'YYYY-MM-DD': { event: n } } -> [{ month, event, uses }] sorted. Pure. */
export function monthly(days) {
  const totals = new Map();
  for (const [day, counts] of Object.entries(days ?? {})) {
    const month = day.slice(0, 7);
    for (const [event, n] of Object.entries(counts ?? {})) {
      if (typeof n !== 'number' || !Number.isFinite(n)) continue;
      const key = `${month}\u0000${event}`;
      totals.set(key, (totals.get(key) ?? 0) + n);
    }
  }
  return [...totals]
    .map(([k, uses]) => {
      const [month, event] = k.split('\u0000');
      return { month, event, uses };
    })
    .sort((a, b) => a.month.localeCompare(b.month) || b.uses - a.uses);
}

/** The first and last day held, so a partial month is never read as a whole one. */
export function coverage(days) {
  const keys = Object.keys(days ?? {}).sort();
  return keys.length ? { from: keys[0], to: keys.at(-1) } : null;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const token = process.env.METRICS_TOKEN;
  if (!token) {
    console.error('Set METRICS_TOKEN (the value configured on Netlify) and run again.');
    process.exit(1);
  }
  const res = await fetch(`${SITE}/.netlify/functions/track?token=${encodeURIComponent(token)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    console.error(`Refused (HTTP ${res.status}). Check the token matches Netlify's METRICS_TOKEN.`);
    process.exit(1);
  }
  const rows = monthly(body.days);
  const cov = coverage(body.days);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ coverage: cov, rows }, null, 2));
  } else {
    console.log(cov ? `Counters held ${cov.from} to ${cov.to} (first and last months may be partial)\n` : 'No counters held.');
    let current = '';
    for (const r of rows) {
      if (r.month !== current) {
        current = r.month;
        const total = rows.filter((x) => x.month === current).reduce((s, x) => s + x.uses, 0);
        console.log(`${current}  ${total} uses`);
      }
      console.log(`  ${String(r.uses).padStart(6)}  ${r.event}`);
    }
  }
}
