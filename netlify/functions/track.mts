/**
 * Count tool usage. Nothing else.
 *
 * POST { event } — where event is on the client's fixed whitelist — increments
 * a counter under today's date. The stored value is a map of event name to
 * integer; there is no user identifier anywhere in the write path, so this
 * store cannot leak what it never held.
 *
 * GET ?token=… returns the last 60 days of counters for the site owner. The
 * token is METRICS_TOKEN from the environment; without it configured, reads
 * are disabled entirely rather than open.
 *
 * HONESTY NOTE ON THE COUNTS: read-modify-write on a blob is not atomic, so
 * two beacons landing in the same instant can lose one increment. At this
 * site's traffic that is noise, and the alternative (a real database) is not
 * worth its weight yet. The numbers are for ranking tools against each other,
 * not for billing anyone.
 */
import type { Config, Context } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

// Mirror of TRACKED_EVENTS in src/lib/analytics.ts. Duplicated deliberately:
// the function must not depend on app code that could drift under it, and the
// no-exchange-data guard tests pin the two lists to each other.
const TRACKED_EVENTS = new Set([
  'view:landing',
  'view:dashboard',
  'view:goals',
  'view:tbills',
  'view:ladder',
  'view:calculator',
  'view:auctions',
  'view:portfolio',
  'view:prices',
  'view:sell',
  'view:alerts',
  'view:learn',
  'act:calculator-run',
  'act:sell-analysed',
  'act:bid-tested',
  'act:price-saved',
  'act:ladder-built',
  'act:alerts-enabled',
]);

const ALLOWED = [
  'https://mwangazayield.org',
  'https://www.mwangazayield.org',
  'https://main--mwangazayield.netlify.app',
];

const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': origin && ALLOWED.includes(origin) ? origin : ALLOWED[0],
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
});

export default async (req: Request, _context: Context) => {
  const headers = { ...cors(req.headers.get('origin')), 'content-type': 'application/json' };

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });

  const store = getStore('metrics');

  if (req.method === 'POST') {
    let event: unknown;
    try {
      event = (await req.json())?.event;
    } catch {
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
    }
    if (typeof event !== 'string' || !TRACKED_EVENTS.has(event)) {
      // Unknown names are refused, not stored: the whitelist is what keeps
      // this store bounded and boring.
      return new Response(JSON.stringify({ ok: false }), { status: 400, headers });
    }
    const day = new Date().toISOString().slice(0, 10);
    const counts = ((await store.get(day, { type: 'json' })) ?? {}) as Record<string, number>;
    counts[event] = (counts[event] ?? 0) + 1;
    await store.setJSON(day, counts);
    return new Response(JSON.stringify({ ok: true }), { status: 202, headers });
  }

  if (req.method === 'GET') {
    const configured = process.env.METRICS_TOKEN;
    const given = new URL(req.url).searchParams.get('token');
    if (!configured || given !== configured) {
      return new Response(JSON.stringify({ ok: false }), { status: 401, headers });
    }
    const { blobs } = await store.list();
    const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
    const days: Record<string, Record<string, number>> = {};
    for (const b of blobs.filter((x) => x.key >= cutoff).sort((a, z) => a.key.localeCompare(z.key))) {
      days[b.key] = ((await store.get(b.key, { type: 'json' })) ?? {}) as Record<string, number>;
    }
    return new Response(JSON.stringify({ ok: true, days }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ ok: false }), { status: 405, headers });
};

export const config: Config = {
  path: '/.netlify/functions/track',
};
